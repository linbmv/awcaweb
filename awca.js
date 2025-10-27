const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const P = require('pino');
const axios = require('axios');
const fs = require('fs');
const qrcode = require('qrcode-terminal');

// --- Configuration ---
const groupIds = ["120363320187783071@g.us", "120363322577252489@g.us", "120363307329726249@g.us"];
const bibleReadingPlanUrl = "https://gist.githubusercontent.com/linbmv/8adb195011a6422d4ee40f773f32a8fa/raw/bible_reading_plan.txt";
const dailyWordUrl = "https://gist.githubusercontent.com/linbmv/8adb195011a6422d4ee40f773f32a8fa/raw/daily_word.txt";
const SESSION_FILE_PATH = './baileys_auth_info/';
const MESSAGE_SEND_DELAY_MS = 2000; // 每条消息发送后的延迟 (毫秒)
const EXIT_DELAY_MS = 5000; // 发送完所有消息后，等待多久退出脚本 (毫秒)
// --- End Configuration ---

// --- State Variable ---
let messagesHaveBeenSentThisSession = false;
let hasInitiatedExit = false; // 防止重复调用 exit
// --- End State Variable ---

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function connectToWhatsApp() {
    console.log("Attempting to connect to WhatsApp...");
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_FILE_PATH);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`Using Baileys version: ${version.join('.')}, isLatest: ${isLatest}`);

    const sock = makeWASocket({
        version,
        logger: P({ level: 'silent' }), // 可以改为 'info' 或 'debug' 查看更多日志
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, P({ level: 'silent' })),
        },
        browser: ['MyScript', 'Chrome', '1.0.0'],
        generateHighQualityLinkPreview: true,
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        console.log(`Connection update: ${connection}`, qr ? "(QR available)" : "", lastDisconnect ? `(Last disconnect reason: ${JSON.stringify(lastDisconnect.error?.output?.payload)})` : "");

        if (qr) {
            console.log('QR code received, scan it with your phone:');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const statusCode = (lastDisconnect.error)?.output?.statusCode;
            // 如果已经开始退出了，就不再尝试重连
            if (hasInitiatedExit) {
                console.log('Connection closed, and script is exiting. No reconnection attempt.');
                return;
            }

            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed due to ', lastDisconnect.error, ` (status code: ${statusCode})`, ', reconnecting: ', shouldReconnect);

            if (shouldReconnect) {
                // 只有在消息尚未发送且未开始退出时才尝试重连
                if (!messagesHaveBeenSentThisSession) {
                    console.log("Attempting to reconnect as messages were not sent...");
                    connectToWhatsApp();
                } else {
                    console.log("Connection closed, but messages were already sent. Not reconnecting.");
                    // 如果消息已发送，且连接关闭了，但又不是我们主动退出的情况，
                    // 这可能是一个意外的断开，但任务已完成，所以也应该退出。
                    // 不过因为我们在 open 时已经有退出了，这里可能不需要额外处理。
                }
            } else {
                console.log('Connection closed permanently (logged out or other non-recoverable error).');
                if (statusCode === DisconnectReason.loggedOut) {
                    console.log('You were logged out. Please delete session folder and restart.');
                    if (fs.existsSync(SESSION_FILE_PATH)) {
                        fs.rmSync(SESSION_FILE_PATH, { recursive: true, force: true });
                        console.log('Session folder deleted.');
                    }
                }
                // 如果是永久关闭且脚本未开始退出，则强制退出
                if (!hasInitiatedExit) {
                    console.log("Exiting due to permanent connection closure.");
                    process.exit(1); // 非正常退出
                }
            }
        } else if (connection === 'open') {
            console.log('Connected to WhatsApp!');

            if (hasInitiatedExit) {
                console.log("Connection opened, but script is already in the process of exiting. Closing this new connection.");
                sock.end(undefined);
                return;
            }

            if (!messagesHaveBeenSentThisSession) {
                try {
                    await sendMessagesToGroups(sock);
                    messagesHaveBeenSentThisSession = true;
                    console.log(`All messages sent. Script will exit in ${EXIT_DELAY_MS / 1000} seconds.`);
                    hasInitiatedExit = true; // 标记开始退出流程

                    await delay(EXIT_DELAY_MS); // 等待一段时间确保消息发出和连接关闭完成
                    console.log("Closing WhatsApp connection now...");
                    sock.end(undefined); // 主动关闭连接

                    // 等待连接真正关闭事件或者一小段时间后退出
                    // Baileys 的 sock.end() 是异步的，并不会立即关闭
                    // 给一点时间让 'close' 事件触发，或者直接退出
                    console.log("Exiting script now.");
                    process.exit(0); // 正常退出

                } catch (error) {
                    console.error("Error during message sending process:", error);
                    hasInitiatedExit = true; // 即使出错也标记退出
                    console.log("Exiting script due to error during sending.");
                    process.exit(1); // 非正常退出
                }
            } else {
                // 这种情况理论上不应该发生，因为如果 messagesHaveBeenSentThisSession 为 true，
                // 并且 hasInitiatedExit 为 false，说明之前的发送流程没有正确启动退出。
                // 但作为防御，如果连接意外重开且消息已发送，也关闭并准备退出。
                console.log('Connection (re-)established, but messages were already sent and exit was not initiated. This is unexpected.');
                console.log('Closing this redundant connection and initiating exit.');
                hasInitiatedExit = true;
                sock.end(undefined);
                process.exit(0);
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);
    return sock;
}

async function fetchMessageContent(url) {
    try {
        const response = await axios.get(url);
        return response.data.trim();
    } catch (error) {
        console.error(`Error fetching content from ${url}:`, error.message);
        return null; // 或者抛出错误，让上层处理
    }
}

async function sendMessagesToGroups(sock) {
    console.log("Fetching message contents for sending...");
    const biblePlanMessage = await fetchMessageContent(bibleReadingPlanUrl);
    const dailyWordMessage = await fetchMessageContent(dailyWordUrl);

    if (!biblePlanMessage) {
        console.error("Failed to fetch Bible Reading Plan. Aborting send operation.");
        throw new Error("Failed to fetch Bible Reading Plan."); // 抛出错误以便上层捕获
    }
    if (!dailyWordMessage) {
        console.error("Failed to fetch Daily Word. Aborting send operation.");
        throw new Error("Failed to fetch Daily Word."); // 抛出错误
    }

    console.log("\n--- Bible Reading Plan Message (Preview) ---");
    console.log(biblePlanMessage.substring(0, 100) + "...");
    console.log("\n--- Daily Word Message (Preview) ---");
    console.log(dailyWordMessage.substring(0, 100) + "...");
    console.log("\nStarting to send messages to groups...");

    for (const groupId of groupIds) {
        console.log(`\nProcessing group: ${groupId}`);
        try {
            console.log(`Sending Bible Reading Plan to ${groupId}...`);
            await sock.sendMessage(groupId, { text: biblePlanMessage });
            console.log(` > Bible Reading Plan sent to ${groupId}`);
            await delay(MESSAGE_SEND_DELAY_MS);

            console.log(`Sending Daily Word to ${groupId}...`);
            await sock.sendMessage(groupId, { text: dailyWordMessage });
            console.log(` > Daily Word sent to ${groupId}`);
            await delay(MESSAGE_SEND_DELAY_MS);

        } catch (error) {
            console.error(`Failed to send messages to group ${groupId}:`, error);
            // 你可以选择是否因为一个群组发送失败就中断整个过程
            // throw error; // 如果需要中断，取消这行注释
        }
    }
    console.log("Finished iterating through groups for sending.");
}

// Start the process
connectToWhatsApp().catch(err => {
    console.error("Unhandled error in initial connectToWhatsApp call:", err);
    if (!hasInitiatedExit) { // 确保不会重复退出
        process.exit(1); // 非正常退出
    }
});
