const cheerio = require('cheerio');
const { google } = require('googleapis');
const fs = require('fs');

const URL =
    'https://www.gymnathlon.sk/kurzy/vyber/filter?gps-entity=kosice-i&gps-source=city&program%5B0%5D=baby&show-occupied=1';

const TOKEN_PATH = 'token.json';
const CREDENTIALS_PATH = 'credentials.json';
const STATE_PATH = 'state.json';

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
// EMAIL
// ========================================

function createEmailResult(courses) {

    if (courses.length === 0) {

        return `
Gymnathlon Checker

Nepodarilo sa nájsť žiadne Baby kurzy.
        `.trim();
    }

    const availableCourses = courses.filter(course =>
        course.statusClass.includes('occupancy-indicator-available') ||
        course.statusClass.includes('occupancy-indicator-last')
    );

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

function loadState() {

    if (!fs.existsSync(STATE_PATH)) {

        return {
            alertedCourses: []
        };
    }

    return JSON.parse(
        fs.readFileSync(STATE_PATH, 'utf8')
    );
}


function saveState(state) {

    fs.writeFileSync(
        STATE_PATH,
        JSON.stringify(state, null, 2)
    );
}


// ========================================
// GMAIL
// ========================================

async function authorizeGmail() {

    const credentials = JSON.parse(
        fs.readFileSync(CREDENTIALS_PATH, 'utf8')
    );

    const { client_secret, client_id, redirect_uris } =
        credentials.installed || credentials.web;

    const oAuth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uris[0]
    );

    const token = JSON.parse(
        fs.readFileSync(TOKEN_PATH, 'utf8')
    );

    oAuth2Client.setCredentials(token);

    return oAuth2Client;
}


async function sendEmail(subject, body) {

    const auth = await authorizeGmail();

    const gmail = google.gmail({
        version: 'v1',
        auth,
    });

    const message = [
        'From: me',
        `To: ${EMAIL_TO}`,
        `Subject: ${subject}`,
        'Content-Type: text/plain; charset="UTF-8"',
        '',
        body,
    ].join('\n');

    const encodedMessage = Buffer.from(message)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
            raw: encodedMessage,
        },
    });

    console.log('✅ Email bol odoslaný!');
}


// ========================================
// MAIN
// ========================================

async function main() {

    try {

        const courses = await getCourses();

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

        let availableCourses = courses.filter(course =>
            course.statusClass.includes('occupancy-indicator-available') ||
            course.statusClass.includes('occupancy-indicator-last')
        );


        // ========================================
        // DOČASNÝ TEST
        // ========================================

        if (SIMULATE_AVAILABLE && courses.length > 0) {

            console.log('🧪 SIMULÁCIA: prvý kurz je dočasne označený ako voľný.');

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

        const state = loadState();


        const availableCourseIds = availableCourses.map(course =>
            course.id || `${course.location}|${course.term}`
        );


        const newAvailableCourses = availableCourses.filter(course => {

            const courseId =
                course.id || `${course.location}|${course.term}`;

            return !state.alertedCourses.includes(courseId);
        });


        if (newAvailableCourses.length > 0) {

            console.log('🚨 NOVÉ VOĽNÉ MIESTO – odosielam alert!');

            const emailBody = createEmailResult(courses);

            await sendEmail(
                'Gymnathlon Checker - VOLNE MIESTO!',
                emailBody
            );


            state.alertedCourses = availableCourseIds;

            saveState(state);

            console.log('💾 Stav uložený.');

        } else if (availableCourses.length > 0) {

            console.log('Voľné miesto stále existuje.');
            console.log('Email sa neposiela – už bolo nahlásené.');

        } else {

            console.log('Všetky kurzy sú obsadené.');

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

        process.exitCode = 1;
    }
}


main();

