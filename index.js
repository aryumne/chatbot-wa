const {makeWASocket, useMultiFileAuthState, Browsers} = require('@whiskeysockets/baileys');
const { pino } = require('pino');
const fs = require('fs');

let retryCount = 0;
const MAX_RETRIES = 5;

async function query(data) {
    console.log("fetching.../");
    const response = await fetch(
        "http://localhost:3000/api/v1/prediction/63c44d79-7bc5-4f21-a865-fd3225d244ac", // url ini dari chatflow yang telah dibuat di flowise
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(data)
        }
    );
    const result = await response.json();
    return result;
}

async function connectToWhatsApp () {
    if (retryCount >= MAX_RETRIES) {
        console.log("Maximum retries reached. Exiting...");
        return;
    }
    const auth = await useMultiFileAuthState("session");
    const sock = makeWASocket({
        printQRInTerminal: true,
        auth: auth.state,
        browser: Browsers.windows('chrome'),
        logger: pino({level: "silent"})
    });

    sock.ev.on("creds.update", auth.saveCreds)
    sock.ev.on('connection.update', ({ connection, qr, lastDisconnect }) => {
        if (connection === 'close') {
            retryCount++;
            const reason = lastDisconnect?.error?.output?.statusCode;
            console.log(`Connection closed due to reason: ${reason}`);

            if (reason === 401) {
                // Jika autentikasi gagal, hapus sesi dan ulang pairing
                console.log("Authentication failed. Reconnecting...");
                if (fs.existsSync('session')) {
                    fs.rmSync('session', { recursive: true, force: true });
                }
                connectToWhatsApp();
            } else {
                // Restart koneksi untuk error lainnya
                console.log("Attempting to restart connection...");
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log("WhatsApp is now active!");
        } else if (connection === 'connecting') {
            console.log("Connecting to WhatsApp...");
        }

        if (qr) {
            console.log("QR Code:", qr);
        }
    });
        sock.ev.on('messages.upsert', async (m) => {
            // console.log(inspect(m, { depth: null, colors: true }));
            if(!m.messages[0].key.fromMe){
                let message = m?.messages[0]?.message?.conversation;
                if(message && message != ""){
                    const firstWord = message.split(" ")[0];
                    const username = m.messages[0].pushName || "kamu";
                    console.log(username,firstWord);
                    if (firstWord.toLowerCase().includes("heybot")) {
                        const aiRes = await query({ "question": message })
                        if (aiRes) {
                            await sock.sendMessage(m.messages[0].key.remoteJid, { text: aiRes.text });
                        } else {
                            await sock.sendMessage(m.messages[0].key.remoteJid, { text: "Sorry ges yaa, chatbotnya lagi gangguan!" });
                        }
                    } 
                }
            }
            return;
        });
}
// run in main file
connectToWhatsApp()
