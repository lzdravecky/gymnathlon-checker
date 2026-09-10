const cheerio = require('cheerio');
const { OAuth2Client } = require('google-auth-library');

const {
    SecretsManagerClient,
    GetSecretValueCommand
} = require('@aws-sdk/client-secrets-manager');

const {
    DynamoDBClient
} = require('@aws-sdk/client-dynamodb');

const {
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand
} = require('@aws-sdk/lib-dynamodb');


const secretsClient = new SecretsManagerClient({
    region: 'eu-central-1'
});

const dynamoClient = new DynamoDBClient({
    region: 'eu-central-1'
});

const dynamo = DynamoDBDocumentClient.from(dynamoClient);


const URL =
    'https://www.gymnathlon.sk/kurzy/vyber/filter?gps-entity=kosice-i&gps-source=city&program%5B0%5D=baby&show-occupied=1';

// ========================================
// NASTAVENIA
// ========================================

// TEST = true  → pošle email pri každom spustení
// TEST = false → ostrý režim
const TEST_MODE = false;

// DOČASNÝ TEST VOĽNÉHO MIESTA
// true  → prvý kurz sa umelo označí ako voľný
// false → používa skutočný stav z Gymnathlonu
const SIMULATE_AVAILABLE = false;

// DAILY REPORT
// true  → pošle aktuálny stav všetkých kurzov a skončí
// false → normálny checker režim
const DAILY_REPORT_MODE = process.argv.includes('--daily-report');

const EMAIL_TO = 'lukas.zdravecky@gmail.com';


// ========================================
// GYMNATHLON
// ========================================

async function getCourses() {

    console.log('Kontrolujem Gymnathlon...');
    console.log(URL);
    console.log('');

    const response = await fetch(URL);

    if (!response.ok) {
        throw new Error(`HTTP chyba: ${response.status}`);
    }

    const html = await response.text();

    console.log(`Stiahnuté HTML: ${html.length} znakov`);
    console.log('');

    return parseCourses(html);
}


function parseCourses(html) {

    const $ = cheerio.load(html);

    const courses = [];

    $('.map-marker-info-window').each((index, locationElement) => {

        const location = $(locationElement)
            .find('.map-marker-title')
            .first()
            .text()
            .replace(/\s+/g, ' ')
            .trim();

        if (!location.includes('Košice')) {
            return;
        }

        $(locationElement)
            .find('.map-marker-activity-item.course-program-baby')
            .each((index, courseElement) => {

                const term = $(courseElement)
                    .find('.activity-term')
                    .text()
                    .replace(/\s+/g, ' ')
                    .trim();

                const occupancyElement = $(courseElement)
                    .find('.activity-occupancy-indicator')
                    .first();

                const status = occupancyElement
                    .text()
                    .replace(/\s+/g, ' ')
                    .trim();

                const statusClass = occupancyElement.attr('class') || '';

                const link = $(courseElement)
                    .find('.activity-detail-link a')
                    .first();

                const url = link.attr('href') || null;
                const id = link.attr('data-dl-id') || null;
                const name = link.attr('data-dl-name') || null;

                courses.push({
                    location,
                    term,
                    status,
                    statusClass,
                    id,
                    name,
                    url
                });
            });
    });

    return courses;
}


// ========================================
// DETEKCIA VOĽNÉHO MIESTA
// ========================================

function isAvailable(course) {

    const status = course.status
        .toLowerCase()
        .trim();

    const statusClass = course.statusClass
        .toLowerCase();

    return (
        statusClass.includes('occupancy-indicator-available') ||
        statusClass.includes('occupancy-indicator-last') ||
        status.includes('voľné miesta') ||
        status.includes('voľné miesto') ||
        status.includes('posledné miesto')
    );
}


// ========================================
// EMAIL
// ========================================

function createEmailResult(courses) {

    if (courses.length === 0) {

        return `
Gymnathlon Checker

Nepodarilo sa nájsť žiadne Baby kurzy.
        `.trim();
    }

    const availableCourses = courses.filter(isAvailable);

    let result = 'Gymnathlon Checker\n\n';

    result += `Nájdených Baby kurzov: ${courses.length}\n\n`;

    for (const course of courses) {

        result += `${course.location}\n`;
        result += `${course.term} – ${course.status}\n`;

        if (course.url) {
            result += `${course.url}\n`;
        }

        result += '\n';
    }

    if (availableCourses.length > 0) {

        result += '⚠️ POZOR – našiel som dostupné miesto!\n';

    } else {

        result += 'Všetky kurzy sú momentálne obsadené.\n';
    }

    return result.trim();
}


// ========================================
// STATE
// ========================================

async function loadState() {

    const command = new GetCommand({
        TableName: 'gymnathlon-state',
        Key: {
            id: 'checker-state'
        }
    });

    const response = await dynamo.send(command);

    if (!response.Item) {

        return {
            alertedCourses: []
        };
    }

    return {
        alertedCourses: response.Item.alertedCourses || []
    };
}


async function saveState(state) {

    const command = new PutCommand({
        TableName: 'gymnathlon-state',

        Item: {
            id: 'checker-state',
            alertedCourses: state.alertedCourses
        }
    });

    await dynamo.send(command);
}


// ========================================
// GMAIL
// ========================================

async function authorizeGmail() {

    const command = new GetSecretValueCommand({
        SecretId: 'gymnathlon/gmail'
    });

    const response = await secretsClient.send(command);

    const secret = JSON.parse(response.SecretString);

    const credentials = JSON.parse(secret.credentials);
    const token = JSON.parse(secret.token);

    const { client_secret, client_id, redirect_uris } =
        credentials.installed || credentials.web;

    const oAuth2Client = new OAuth2Client(
        client_id,
        client_secret,
        redirect_uris[0]
    );

    oAuth2Client.setCredentials(token);

    return oAuth2Client;
}


async function sendEmail(subject, body) {

    const auth = await authorizeGmail();

    const accessTokenResponse = await auth.getAccessToken();
    const accessToken = accessTokenResponse.token;

    if (!accessToken) {
        throw new Error('Nepodarilo sa ziskat Gmail access token.');
    }

    const message = [
        'From: me',
        `To: ${EMAIL_TO}`,
        `Subject: ${subject}`,
        'Content-Type: text/plain; charset="UTF-8"',
        '',
        body,
    ].join('\n');

    const encodedMessage = Buffer.from(message)
        .toString('base64url');

    const response = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        {
            method: 'POST',

            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },

            body: JSON.stringify({
                raw: encodedMessage,
            }),
        }
    );

    if (!response.ok) {

        const errorBody = await response.text();

        throw new Error(
            `Gmail API chyba ${response.status}: ${errorBody}`
        );
    }

    console.log('✅ Email bol odoslaný!');
}


// ========================================
// MAIN
// ========================================

async function main(dailyReportMode = DAILY_REPORT_MODE) {

    try {

        const courses = await getCourses();


        // ========================================
        // DAILY REPORT
        // ========================================

        if (dailyReportMode) {

            console.log(
                '🕘 DAILY REPORT – posielam aktuálny stav kurzov.'
            );

            const emailBody = createEmailResult(courses);

            await sendEmail(
                'Gymnathlon Checker - Daily report',
                emailBody
            );

            return;
        }


        // ========================================
        // VÝPIS KURZOV
        // ========================================

        console.log('NÁJDENÉ BABY KURZY:');
        console.log('----------------------------------------');

        if (courses.length === 0) {

            console.log('Žiadne kurzy.');

        } else {

            for (const course of courses) {

                console.log(
                    `${course.location} | ${course.term} | ${course.status}`
                );
            }
        }

        console.log('');

        let availableCourses = courses.filter(isAvailable);


        // ========================================
        // DOČASNÝ TEST
        // ========================================

        if (SIMULATE_AVAILABLE && courses.length > 0) {

            console.log(
                '🧪 SIMULÁCIA: prvý kurz je dočasne označený ako voľný.'
            );

            availableCourses.push(courses[0]);
        }


        // ========================================
        // TESTOVACÍ REŽIM
        // ========================================

        if (TEST_MODE) {

            console.log('🧪 TEST MODE – posielam email vždy.');

            const emailBody = createEmailResult(courses);

            await sendEmail(
                'Gymnathlon Checker',
                emailBody
            );

            return;
        }


        // ========================================
        // OSTRÝ REŽIM + STATE
        // ========================================

        const state = await loadState();


        // ID všetkých kurzov, ktoré sú AKTUÁLNE voľné
        const availableCourseIds = availableCourses.map(course =>
            course.id || `${course.location}|${course.term}`
        );


        // Z nich vyberieme iba tie, ktoré ešte neboli nahlásené
        const newAvailableCourses = availableCourses.filter(course => {

            const courseId =
                course.id || `${course.location}|${course.term}`;

            return !state.alertedCourses.includes(courseId);
        });


        // ========================================
        // NOVÉ VOĽNÉ MIESTA
        // ========================================

        if (newAvailableCourses.length > 0) {

            console.log(
                '🚨 NOVÉ VOĽNÉ MIESTO – odosielam alert!'
            );

            const emailBody = createEmailResult(courses);

            await sendEmail(
                'Gymnathlon Checker - VOLNE MIESTO!',
                emailBody
            );

            /*
             * DÔLEŽITÉ:
             *
             * State nastavíme na AKTUÁLNE voľné kurzy.
             *
             * Tým sa automaticky odstránia kurzy,
             * ktoré sa medzičasom zaplnili.
             */
            state.alertedCourses = availableCourseIds;

            await saveState(state);

            console.log('💾 Stav uložený.');

        } else if (availableCourses.length > 0) {

            console.log('Voľné miesto stále existuje.');

            /*
             * Aj keď neposielame email, musíme state
             * synchronizovať s aktuálnym stavom.
             *
             * Ak sa napríklad:
             *
             * 597 = stále voľný
             * 600 = medzičasom sa zaplnil
             *
             * state sa zmení z:
             *
             * ["597", "600"]
             *
             * na:
             *
             * ["597"]
             *
             * Tým sa 600 môže neskôr znovu nahlásiť.
             */
            state.alertedCourses = availableCourseIds;

            saveState(state);

            console.log('💾 Stav synchronizovaný.');
            console.log('Email sa neposiela – už bolo nahlásené.');

        } else {

            console.log('Všetky kurzy sú obsadené.');

            /*
             * Žiadny kurz už nie je voľný.
             *
             * Preto vymažeme všetky ID zo state.
             *
             * Ak sa niektorý kurz neskôr uvoľní,
             * bude opäť považovaný za NOVÉ voľné miesto.
             */
            if (state.alertedCourses.length > 0) {

                state.alertedCourses = [];

                saveState(state);

                console.log('💾 Stav resetovaný.');
            }

            console.log('Email sa neposiela.');
        }


    } catch (error) {

        console.error('CHYBA:');
        console.error(error);

        throw error;
    }
}


if (require.main === module) {
    main();
}

async function handler(event = {}) {
    const dailyReportMode = event.dailyReport === true;

    console.log(JSON.stringify({
        event: 'checker_started',
        mode: dailyReportMode ? 'daily-report' : 'checker',
        timestamp: new Date().toISOString()
    }));

    await main(dailyReportMode);

    console.log(JSON.stringify({
        event: 'checker_finished',
        mode: dailyReportMode ? 'daily-report' : 'checker',
        timestamp: new Date().toISOString()
    }));

    return {
        statusCode: 200,
        body: 'Gymnathlon checker finished'
    };
}

module.exports = {
    parseCourses,
    isAvailable,
    handler
};
