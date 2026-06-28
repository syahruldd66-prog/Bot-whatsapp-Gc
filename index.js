// GLOBAL ERROR HANDLER
process.on('uncaughtException', console.error);
process.on('unhandledRejection', console.error);

const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason 
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const cron = require('node-cron'); 
const fs = require('fs');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// === WEB SERVER UNTUK KEEP-ALIVE ===
app.get('/', (req, res) => res.send('Bot WhatsApp Aktif! ✅'));
app.get('/health', (req, res) => res.json({ status: 'online', uptime: process.uptime() }));
app.listen(PORT, () => console.log(`[WEB] Server berjalan di port ${PORT}`));

// === KONFIGURASI BOT ===
const prefix = '.'; 
const ZONA_WAKTU = 'Asia/Makassar';
const CONFIG_FILE = './config.json';
const AFK_FILE = './afk.json';

const OWNER_RAW = '61486919602270'; // Ganti dengan nomor owner

const TEKS_SEWA_BOT = `🛒 *PRICELIST SEWA BOT* 🛒

Mau bot ini masuk ke grup lo? Yuk sewa sekarang!
• 1 Minggu : Rp 5.000
• 1 Bulan  : Rp 15.000

*Fitur Bot:*
» Welcome & Leave Custom per Grup
» Hidetag & Pengelolaan Grup Otomatis
» Sistem AFK Akurat per Grup
» Game & Fitur Admin Lainnya

💳 *Pembayaran:* DANA / GOPAY / REK
Jika berminat, silakan hubungi owner langsung atau ketik pesan di sini.
📞 *Owner:* wa.me/6282293795296`;

// === FUNGSI LOAD/SAVE CONFIG ===
function loadConfig() {
    if (!fs.existsSync(CONFIG_FILE)) {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify({}, null, 2));
        return {};
    }
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
}

function saveConfig(config) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function loadAfk() {
    if (!fs.existsSync(AFK_FILE)) {
        fs.writeFileSync(AFK_FILE, JSON.stringify({}, null, 2));
        return {};
    }
    return JSON.parse(fs.readFileSync(AFK_FILE, 'utf-8'));
}

function saveAfk(data) {
    fs.writeFileSync(AFK_FILE, JSON.stringify(data, null, 2));
}

// === START BOT ===
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./session_admin_bot');

    const nomorBot = process.env.NOMOR_BOT || "992909008102"; 

    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: ["Mac OS", "Chrome", "124.0.0.0"],
        syncFullHistory: false,
        printQRInTerminal: true, // Fallback QR jika pairing gagal
    });

    // === PAIRING CODE ===
    if (!sock.authState.creds.registered && nomorBot) {
        setTimeout(async () => {
            try {
                console.log(`⏳ Meminta kode pairing untuk: ${nomorBot}...`);
                const code = await sock.requestPairingCode(nomorBot.replace(/[^0-9]/g, '').trim());
                const formatCode = code?.match(/.{1,4}/g)?.join("-") || code;
                console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
                console.log(`🔑 [ PAIRING CODE ]: ${formatCode}`);
                console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
            } catch (error) {
                console.error("❌ Gagal generate pairing code:", error.message);
                console.log("[INFO] Scan QR Code di terminal jika muncul.");
            }
        }, 10000); 
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('[QR] Scan QR Code ini jika pairing gagal:');
            console.log(qr);
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom) ? 
                lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut : true;
            if (shouldReconnect) {
                console.log("🔄 Koneksi terputus, mencoba sambung kembali dalam 5 detik...");
                setTimeout(() => startBot(), 5000);
            } else {
                console.log('❌ Logout terdeteksi. Hapus folder session dan jalankan ulang.');
            }
        } else if (connection === 'open') {
            console.log('✅ BOT AKTIF & SIAP TEMPUR!');
            
            // Pengingat Jum'at (02:45 WITA)
            cron.schedule('45 2 * * 5', async () => {
                try {
                    const groups = await sock.groupFetchAllParticipating();
                    for (let id in groups) {
                        await sock.sendMessage(id, { text: "📢 *PENGINGAT JUMAT*\n\nYuk ke Masjid! ✨" });
                    }
                } catch (e) { console.log(e.message); }
            }, { scheduled: true, timezone: ZONA_WAKTU });

            // Buka grup jam 05:00 WITA
            cron.schedule('0 5 * * *', async () => {
                try {
                    const groups = await sock.groupFetchAllParticipating();
                    for (let id in groups) {
                        await sock.groupSettingUpdate(id, 'not_announcement');
                        await sock.sendMessage(id, { text: "📢 *GRUP DIBUKA OLEH SYSTEM.*\n\n*SILAHKAN LANJUTKAN AKTIVITAS/CHAT ANDA!!*" });
                    }
                } catch (e) { console.log(e.message); }
            }, { scheduled: true, timezone: ZONA_WAKTU });

            // Kunci grup jam 01:30 WITA
            cron.schedule('30 1 * * *', async () => {
                try {
                    const groups = await sock.groupFetchAllParticipating();
                    for (let id in groups) {
                        await sock.groupSettingUpdate(id, 'announcement');
                        await sock.sendMessage(id, { text: "📢 *GRUP DIKUNCI / CLOSED UNTUK JAM GB INDONESIA.*\n\n*SILAHKAN LANJUTKAN AKTIVITAS/CHAT ANDA!!*" });
                    }
                } catch (e) { console.log(e.message); }
            }, { scheduled: true, timezone: ZONA_WAKTU });
        }
    });

    // === GROUP PARTICIPANTS ===
    sock.ev.on('group-participants.update', async (anu) => {
        try {
            const config = loadConfig();
            const groupId = anu.id;
            const statusWelcome = config[groupId]?.status !== 'off'; 
            if (!statusWelcome) return; 

            const welcomeText = config[groupId]?.welcome || null;
            const leaveText = config[groupId]?.leave || null;

            for (let participant of anu.participants) {
                const memberJid = participant.id || participant; 
                const angka = memberJid.split('@')[0];

                if (anu.action === 'add') {
                    if (!welcomeText) return; 
                    const teksCustom = welcomeText.replace(/@user/g, `@${angka}`);
                    await sock.sendMessage(groupId, { text: teksCustom, mentions: [memberJid] });
                } else if (anu.action === 'remove' || anu.action === 'leave') {
                    if (!leaveText) return; 
                    const teksCustom = leaveText.replace(/@user/g, `@${angka}`);
                    await sock.sendMessage(groupId, { text: teksCustom, mentions: [memberJid] });
                }
            }
        } catch (err) { console.log(err.message); }
    });

    // === MESSAGES ===
    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek.message || mek.key.fromMe) return; 
            
            const from = mek.key.remoteJid;
            const isGroup = from.endsWith('@g.us');
            const sender = mek.key.participant || mek.key.remoteJid;
            const type = Object.keys(mek.message)[0];

            let body = '';
            if (type === 'conversation') body = mek.message.conversation;
            else if (type === 'extendedTextMessage') body = mek.message.extendedTextMessage.text;
            else if (type === 'imageMessage') body = mek.message.imageMessage.caption;

            if (!body) return;

            const lowerBody = body.toLowerCase().trim();
            const isOwner = sender.includes(OWNER_RAW);

            // === CHAT PRIBADI ===
            if (!isGroup && !isOwner && !body.startsWith(prefix)) {
                return await sock.sendMessage(from, { text: TEKS_SEWA_BOT }, { quoted: mek });
            }

            if (lowerBody === 'bot') {
                return await sock.sendMessage(from, { text: "Bot aktif siap melayani" }, { quoted: mek });
            }

            // === AFK SYSTEM ===
            const afkDb = loadAfk();
            const afkKey = isGroup ? `${from}_${sender}` : `pc_${sender}`;

            function hitungDurasi(waktuAwal) {
                const selisih = Date.now() - waktuAwal;
                const totalDetik = Math.floor(selisih / 1000);
                const jam = Math.floor(totalDetik / 3600);
                const menit = Math.floor((totalDetik % 3600) / 60);
                const detik = totalDetik % 60;

                let hasil = [];
                if (jam > 0) hasil.push(`${jam} jam`);
                if (menit > 0) hasil.push(`${menit} menit`);
                hasil.push(`${detik} detik`);
                return hasil.join(' ');
            }

            if (afkDb[afkKey]) {
                const durasi = hitungDurasi(afkDb[afkKey].waktu);
                delete afkDb[afkKey];
                saveAfk(afkDb);
                await sock.sendMessage(from, { 
                    text: `👋 @${sender.split('@')[0]} telah kembali dari AFK!\n⏳ *Durasi AFK:* ${durasi}`, 
                    mentions: [sender] 
                }, { quoted: mek });
            }

            const jidDitag = mek.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
            for (let jid of jidDitag) {
                const targetKey = isGroup ? `${from}_${jid}` : `pc_${jid}`;
                if (afkDb[targetKey] && jid !== sender) { 
                    const durasi = hitungDurasi(afkDb[targetKey].waktu);
                    await sock.sendMessage(from, { 
                        text: `🚫 Orang yang lo tag (*@${jid.split('@')[0]}*) lagi AFK di grup ini!\n📝 *Alasan:* ${afkDb[targetKey].alasan}\n⏳ *Sudah AFK selama:* ${durasi}`,
                        mentions: [jid]
                    }, { quoted: mek });
                }
            }

            const jidDireply = mek.message.extendedTextMessage?.contextInfo?.participant;
            if (jidDireply && jidDireply !== sender) {
                const replyKey = isGroup ? `${from}_${jidDireply}` : `pc_${jidDireply}`;
                if (afkDb[replyKey]) {
                    const durasi = hitungDurasi(afkDb[replyKey].waktu);
                    await sock.sendMessage(from, { 
                        text: `🚫 Orang yang lo reply (*@${jidDireply.split('@')[0]}*) lagi AFK di grup ini!\n📝 *Alasan:* ${afkDb[replyKey].alasan}\n⏳ *Sudah AFK selama:* ${durasi}`,
                        mentions: [jidDireply]
                    }, { quoted: mek });
                }
            }

            // === COMMAND ===
            if (!body.startsWith(prefix)) return;
            const args = body.trim().split(/ +/);
            const command = args.shift().toLowerCase().slice(1);
            const q = args.join(' ');

            if (command === 'afk') {
                const alasanAfk = q ? q : 'Tanpa alasan';
                afkDb[afkKey] = { alasan: alasanAfk, waktu: Date.now() };
                saveAfk(afkDb);
                return await sock.sendMessage(from, { 
                    text: `💤 @${sender.split('@')[0]} sekarang AFK khusus untuk obrolan ini!\n📝 *Alasan:* ${alasanAfk}`, 
                    mentions: [sender] 
                }, { quoted: mek });
            }

            if (!isGroup && !isOwner) return; 

            let isAdmin = false;
            let groupMetadata = null;
            if (isGroup) {
                groupMetadata = await sock.groupMetadata(from);
                isAdmin = groupMetadata.participants.find(p => p.id === sender)?.admin !== null;
            }

            if (!isAdmin && !isOwner) return;

            const config = loadConfig();

            switch (command) {
                case 'menu':
                    await sock.sendMessage(from, { 
                        text: `🛠 *MENU ADMIN*\n.h [teks / reply]\n.kick [tag]\n.add [nomor]\n.group [open/close]\n.del [reply]\n.onwelcome [on/off]\n.setwelcome [teks]\n.setleave [teks]\n.checkwelcome\n.checkleave\n\n✨ *MENU UTAMA*\n.afk [alasan]` 
                    }, { quoted: mek });
                    break;

                case 'checkwelcome':
                    const currentWelcome = config[from]?.welcome || 'Belum di-set (Kosong/Pasif)';
                    await sock.sendMessage(from, { text: `📝 *Isi Teks Welcome Saat Ini:*\n\n${currentWelcome}` }, { quoted: mek });
                    break;

                case 'checkleave':
                    const currentLeave = config[from]?.leave || 'Belum di-set (Kosong/Pasif)';
                    await sock.sendMessage(from, { text: `📝 *Isi Teks Leave Saat Ini:*\n\n${currentLeave}` }, { quoted: mek });
                    break;

                case 'onwelcome':
                    if (!q) return sock.sendMessage(from, { text: `❌ Masukkan opsi!\n.onwelcome on/off` }, { quoted: mek });
                    const opsi = q.toLowerCase().trim();
                    if (opsi !== 'on' && opsi !== 'off') return sock.sendMessage(from, { text: `❌ Pilihan hanya *on* atau *off*!` }, { quoted: mek });
                    
                    if (!config[from]) config[from] = {};
                    config[from].status = opsi;
                    saveConfig(config);
                    await sock.sendMessage(from, { text: `✅ Welcome/Leave diubah menjadi: *${opsi.toUpperCase()}*` }, { quoted: mek });
                    break;

                case 'setwelcome':
                    if (!q) return sock.sendMessage(from, { text: `❌ Masukkan teks welcome!\nGunakan *@user* untuk tag member.` }, { quoted: mek });
                    if (!config[from]) config[from] = {}; 
                    config[from].welcome = q;
                    saveConfig(config);
                    await sock.sendMessage(from, { text: `✅ Teks Welcome berhasil diubah!` }, { quoted: mek });
                    break;

                case 'setleave':
                    if (!q) return sock.sendMessage(from, { text: `❌ Masukkan teks leave!\nGunakan *@user* untuk tag member.` }, { quoted: mek });
                    if (!config[from]) config[from] = {};
                    config[from].leave = q;
                    saveConfig(config);
                    await sock.sendMessage(from, { text: `✅ Teks Leave berhasil diubah!` }, { quoted: mek });
                    break;

                case 'add':
                    const target = q.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
                    await sock.groupParticipantsUpdate(from, [target], 'add');
                    await sock.sendMessage(from, { text: `✅ Berhasil menambahkan @${target.split('@')[0]}`, mentions: [target] });
                    break;

                case 'h':
                    if (!isGroup) return sock.sendMessage(from, { text: `❌ Hidetag cuma di grup!` });
                    const semuaMember = groupMetadata.participants.map(p => p.id);
                    const quotedMsg = mek.message.extendedTextMessage?.contextInfo?.quotedMessage;
                    const isFotoLangsung = type === 'imageMessage';
                    const isReplyFoto = type === 'extendedTextMessage' && mek.message.extendedTextMessage.contextInfo?.quotedMessage?.imageMessage;

                    let teksHidetag = q || (quotedMsg && !isReplyFoto ? (quotedMsg.conversation || quotedMsg.extendedTextMessage?.text) : '') || '📢 PENGUMUMAN!';

                    if (isFotoLangsung || isReplyFoto) {
                        try {
                            const { downloadMediaMessage } = require('@whiskeysockets/baileys');
                            const targetFoto = isReplyFoto ? { message: mek.message.extendedTextMessage.contextInfo.quotedMessage, key: { id: mek.message.extendedTextMessage.contextInfo.stanzaId } } : mek;
                            const mediaBuffer = await downloadMediaMessage(targetFoto, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                            if (mediaBuffer) {
                                await sock.sendMessage(from, { image: mediaBuffer, caption: teksHidetag, mentions: semuaMember });
                            }
                        } catch (mediaErr) { console.log(mediaErr.message); }
                    } else {
                        await sock.sendMessage(from, { text: teksHidetag, mentions: semuaMember });
                    }
                    break;
                    
                case 'kick':
                    let targetKick = mek.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
                    if (targetKick) await sock.groupParticipantsUpdate(from, [targetKick], 'remove');
                    break;
                    
                case 'group':
                    await sock.groupSettingUpdate(from, q.trim() === 'open' ? 'not_announcement' : 'announcement');
                    break;
                    
                case 'del':
                    const m = mek.message.extendedTextMessage?.contextInfo;
                    if (m) await sock.sendMessage(from, { delete: { remoteJid: from, fromMe: false, id: m.stanzaId, participant: m.participant }});
                    break;
            }
        } catch (err) {
            console.error('[ERROR]', err.message);
        }
    });
}

startBot();
