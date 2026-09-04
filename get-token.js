const { google } = require('googleapis');
const fs = require('fs');
const readline = require('readline');

const CREDENTIALS_PATH = 'credentials.json';
const TOKEN_PATH = 'token.json';

const SCOPES = [
    'https://www.googleapis.com/auth/gmail.send'
];

async function main() {

    const credentials = JSON.parse(
        fs.readFileSync(CREDENTIALS_PATH, 'utf8')
    );

    const { client_id, client_secret, redirect_uris } =
        credentials.installed;

    const oAuth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uris[0]
    );

    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: SCOPES
    });

    console.log('');
    console.log('Otvor tento URL v browseri:');
    console.log('');
    console.log(authUrl);
    console.log('');
    console.log(
        'Po autorizácii ťa Google presmeruje na localhost.'
    );
    console.log(
        'Ak stránka localhost nefunguje, je to OK.'
    );
    console.log(
        'Skopíruj CELÚ adresu z browsera a vlož ju sem.'
    );
    console.log('');

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.question('Redirect URL: ', async (redirectUrl) => {

        try {

            const url = new URL(redirectUrl);
            const code = url.searchParams.get('code');

            if (!code) {
                throw new Error(
                    'V URL sa nenašiel parameter "code".'
                );
            }

            const { tokens } =
                await oAuth2Client.getToken(code);

            fs.writeFileSync(
                TOKEN_PATH,
                JSON.stringify(tokens, null, 2)
            );

            console.log('');
            console.log('✅ token.json bol vytvorený.');

        } catch (error) {

            console.error('');
            console.error('❌ Chyba:', error.message);

        } finally {

            rl.close();
        }
    });
}

main();