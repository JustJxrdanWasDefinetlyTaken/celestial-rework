const CHAT_API = "/api/chat";

const SCREEN_API = "/api/screenshare";

const PDF_API = "/api/pdf";



const SESSION_KEY = "celestial-ai-sessions-v3";

const SETTINGS_KEY = "celestial-ai-settings-v3";

const LIMIT_KEY = "celestial-ai-limit-v3";

const DEVICE_KEY = "celestial-device-id-v1";



const LIMIT_MAX = 130;

const LIMIT_WINDOW = 3 * 60 * 60 * 1000;



const $ = id => document.getElementById(id);



const messagesEl = $("messages");

const historyEl = $("history");

const promptEl = $("prompt");

const sendButton = $("send");

const attachmentsEl = $("attachments");



let sessions = readJSON(SESSION_KEY, []);

let currentId = null;

let images = [];

let pdf = null;

let screenStream = null;

let screenPipWindow = null;

let screenFrameTimer = null;

let sending = false;



let settings = {

    model: "gpt-6-astra",

    aiName: "celestial",

    personality: "default",

    systemPrompt: "",

    ...readJSON(SETTINGS_KEY, {})

};



const deviceId = getDeviceId();



function getDeviceId() {

    let id = localStorage.getItem(DEVICE_KEY);



    if (!id) {

        id = crypto.randomUUID();

        localStorage.setItem(DEVICE_KEY, id);

    }



    return id;

}



function readJSON(key, fallback) {

    try {

        return JSON.parse(localStorage.getItem(key)) ?? fallback;

    } catch {

        return fallback;

    }

}



function writeJSON(key, value) {

    localStorage.setItem(key, JSON.stringify(value));

}



function id(prefix = "id") {

    return prefix + "_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);

}



function escapeHTML(value = "") {

    return String(value)

        .replaceAll("&", "&amp;")

        .replaceAll("<", "&lt;")

        .replaceAll(">", "&gt;")

        .replaceAll('"', "&quot;")

        .replaceAll("'", "&#039;");

}



function toast(text) {

    const el = $("toast");



    el.textContent = text;

    el.classList.add("show");



    clearTimeout(toast.timer);



    toast.timer = setTimeout(() => {

        el.classList.remove("show");

    }, 1800);

}



function getLimit() {

    const now = Date.now();



    let data = readJSON(LIMIT_KEY, {

        count: 0,

        reset: now + LIMIT_WINDOW

    });



    if (!data.reset || now >= data.reset) {

        data = {

            count: 0,

            reset: now + LIMIT_WINDOW

        };



        writeJSON(LIMIT_KEY, data);

    }



    return data;

}



function remaining() {

    return Math.max(0, LIMIT_MAX - getLimit().count);

}



function updateLimit() {

    $("limit").textContent = remaining() + " left";

}



function usePrompt() {

    const data = getLimit();



    if (data.count >= LIMIT_MAX) {

        const mins = Math.ceil((data.reset - Date.now()) / 60000);



        toast("limit reached · resets in about " + mins + " min");



        return false;

    }



    data.count++;



    writeJSON(LIMIT_KEY, data);

    updateLimit();



    return true;

}



function getSession() {

    return sessions.find(x => x.id === currentId);

}



function saveSessions() {

    const safe = sessions.map(session => ({

        ...session,



        messages: session.messages.map(message => ({

            ...message,

            images: []

        }))

    }));



    writeJSON(SESSION_KEY, safe);

}



function createSession() {

    const session = {

        id: id("chat"),

        title: "new conversation",

        created: Date.now(),

        messages: []

    };



    sessions.unshift(session);

    currentId = session.id;



    saveSessions();

    renderHistory();

    renderMessages();



    $("title").textContent = session.title;



    return session;

}



function openSession(sessionId) {

    currentId = sessionId;



    const session = getSession();



    if (!session) return;



    $("title").textContent = session.title;



    renderHistory();

    renderMessages();



    $("sidebar").classList.remove("open");

}



function deleteSession(sessionId) {

    sessions = sessions.filter(x => x.id !== sessionId);



    if (currentId === sessionId) {

        currentId = sessions[0]?.id || null;

    }



    saveSessions();



    if (!currentId) {

        createSession();

    } else {

        openSession(currentId);

    }

}



function renderHistory() {

    historyEl.innerHTML = sessions.map(session => `

        <div class="history-item ${session.id === currentId ? "active" : ""}">

            <div

                class="history-title"

                data-open="${escapeHTML(session.id)}"

            >

                ${escapeHTML(session.title)}

            </div>



            <button

                class="history-delete"

                data-delete="${escapeHTML(session.id)}"

            >×</button>

        </div>

    `).join("");



    historyEl.querySelectorAll("[data-open]").forEach(el => {

        el.onclick = () => openSession(el.dataset.open);

    });



    historyEl.querySelectorAll("[data-delete]").forEach(el => {

        el.onclick = event => {

            event.stopPropagation();

            deleteSession(el.dataset.delete);

        };

    });

}



function emptyHTML() {

    return `

        <div class="empty">

            <h1>celestial AI.</h1>

            <p>what can i help you with?</p>



            <div class="suggestions">

                <button class="suggestion" data-prompt="explain this topic simply">

                    explain something

                </button>



                <button class="suggestion" data-prompt="help me study this topic">

                    help me study

                </button>



                <button class="suggestion" data-prompt="solve this step by step">

                    solve a problem

                </button>



                <button class="suggestion" data-prompt="help me write some code">

                    write code

                </button>

            </div>

        </div>

    `;

}



function renderMessages() {

    const session = getSession();



    if (!session?.messages.length) {

        messagesEl.innerHTML = emptyHTML();



        document.querySelectorAll("[data-prompt]").forEach(button => {

            button.onclick = () => {

                promptEl.value = button.dataset.prompt;

                resizePrompt();

                promptEl.focus();

            };

        });



        return;

    }



    messagesEl.innerHTML = session.messages.map(renderMessage).join("");



    bindCodeCopy();

    scrollBottom();

}



function renderMessage(message) {

    const user = message.role === "user";



    let extras = "";



    if (message.images?.length) {

        extras += message.images.map(src => `

            <img class="message-image" src="${src}" alt="">

        `).join("");

    }



    if (message.pdfName) {

        extras += `

            <div class="file-chip">

                PDF · ${escapeHTML(message.pdfName)}

            </div>

        `;

    }



    const body = user

        ? escapeHTML(message.content).replace(/\n/g, "<br>")

        : markdown(message.content);



    return `

        <div class="message ${user ? "user" : "assistant"}">

            <div class="message-inner">



                ${user ? "" : `<div class="avatar">AI</div>`}



                <div class="content">

                    <div class="bubble">

                        ${extras}

                        ${body}

                    </div>

                </div>



                ${user ? `<div class="avatar">U</div>` : ""}



            </div>

        </div>

    `;

}



function markdown(text = "") {

    let safe = escapeHTML(text);



    const codeBlocks = [];



    safe = safe.replace(/```([\w+-]*)\n?([\s\S]*?)```/g, (_, lang, code) => {

        const token = `%%CODE${codeBlocks.length}%%`;



        codeBlocks.push(`

            <pre>

                <button class="code-copy">copy</button><code>${code.trim()}</code>

            </pre>

        `);



        return token;

    });



    safe = renderMath(safe);



    safe = safe

        .replace(/^### (.+)$/gm, "<h3>$1</h3>")

        .replace(/^## (.+)$/gm, "<h2>$1</h2>")

        .replace(/^# (.+)$/gm, "<h1>$1</h1>")

        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")

        .replace(/\*(.+?)\*/g, "<em>$1</em>")

        .replace(/`([^`]+)`/g, "<code>$1</code>")

        .replace(/\n\n/g, "</p><p>")

        .replace(/\n/g, "<br>");



    safe = "<p>" + safe + "</p>";



    codeBlocks.forEach((block, index) => {

        safe = safe.replace(`%%CODE${index}%%`, block);

    });



    return safe;

}



function renderMath(text) {

    text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => {

        return `<span class="math block">${mathSymbols(math)}</span>`;

    });



    text = text.replace(/\$([^$\n]+?)\$/g, (_, math) => {

        return `<span class="math">${mathSymbols(math)}</span>`;

    });



    return text;

}



function mathSymbols(math) {

    let output = math;



    const symbols = {

        "\\\alpha": "α",

        "\\\beta": "β",

        "\\\gamma": "γ",

        "\\\delta": "δ",

        "\\\theta": "θ",

        "\\\lambda": "λ",

        "\\\mu": "μ",

        "\\\pi": "π",

        "\\\sigma": "σ",

        "\\\phi": "φ",

        "\\\omega": "ω",

        "\\\Delta": "Δ",

        "\\\Sigma": "Σ",

        "\\\Omega": "Ω",

        "\\\times": "×",

        "\\\div": "÷",

        "\\\pm": "±",

        "\\\cdot": "·",

        "\\\le": "≤",

        "\\\ge": "≥",

        "\\\ne": "≠",

        "\\\approx": "≈",

        "\\\infty": "∞",

        "\\\sqrt": "√",

        "\\\rightarrow": "→",

        "\\\leftarrow": "←",

        "\\\degree": "°"

    };



    Object.entries(symbols).forEach(([key, value]) => {

        output = output.split(key).join(value);

    });



    output = output.replace(

        /**\\\**&#x66;ra&#x63;**\\{**([^{}]+)**\\}\\{**([^{}]+)**\\}**/g,

        `<span class="fraction"><span class="top">$1</span><span class="bottom">$2</span></span>`

    );



    output = output.replace(/\^\{([^{}]+)\}/g, "<sup>$1</sup>");

    output = output.replace(/_\{([^{}]+)\}/g, "<sub>$1</sub>");

    output = output.replace(/\^([A-Za-z0-9+-]+)/g, "<sup>$1</sup>");

    output = output.replace(/_([A-Za-z0-9+-]+)/g, "<sub>$1</sub>");



    return output;

}



function bindCodeCopy() {

    document.querySelectorAll(".code-copy").forEach(button => {

        button.onclick = async () => {

            const code = button.parentElement.querySelector("code").innerText;



            await navigator.clipboard.writeText(code);



            button.textContent = "copied";



            setTimeout(() => {

                button.textContent = "copy";

            }, 1000);

        };

    });

}



function appendTyping() {

    const html = `

        <div class="message assistant" id="typing">

            <div class="message-inner">

                <div class="avatar">AI</div>



                <div class="content">

                    <div class="typing">

                        <span></span>

                        <span></span>

                        <span></span>

                    </div>

                </div>

            </div>

        </div>

    `;



    messagesEl.insertAdjacentHTML("beforeend", html);

    scrollBottom();

}



function removeTyping() {

    $("typing")?.remove();

}



function getSystemPrompt() {

    const personalityPrompts = {

        default:

            "Be helpful, accurate, clear, and natural.",



        friendly:

            "Be friendly, casual, encouraging, and easy to understand.",



        concise:

            "Give concise direct answers. Avoid unnecessary detail.",



        teacher:

            "Act like a patient tutor. Explain ideas clearly and step by step when useful.",



        creative:

            "Be imaginative and creative while remaining accurate.",



        professional:

            "Use a professional, organized, precise tone.",



        custom:

            ""

    };



    return [

        `Your name is ${settings.aiName || "celestial"}.`,

        personalityPrompts[settings.personality] || "",

        settings.systemPrompt || "",

        "When writing math, you may use $...$ for inline math and $$...$$ for display math."

    ].filter(Boolean).join("\n");

}



function apiHistory(session, currentMessage) {

    const output = [

        {

            role: "system",

            content: getSystemPrompt()

        }

    ];



    session.messages.slice(-20, -1).forEach(message => {

        output.push({

            role: message.role,

            content: message.content

        });

    });



    const parts = [];



    for (const image of currentMessage.images || []) {

        parts.push({

            type: "image_url",

            image_url: {

                url: image

            }

        });

    }



    let text = currentMessage.content || "";



    if (currentMessage.pdfText) {

        text += `



The user attached a PDF named "${currentMessage.pdfName}".



PDF extracted text:

\--- PDF START ---

${currentMessage.pdfText}

\--- PDF END ---



Use the PDF as the source when answering questions about it.`;

    }



    if (parts.length) {

        parts.push({

            type: "text",

            text: text || "Describe the attached image."

        });



        output.push({

            role: "user",

            content: parts

        });

    } else {

        output.push({

            role: "user",

            content: text

        });

    }



    return output;

}



async function api(messages, options = {}) {

    const response = await fetch(options.screen ? SCREEN_API : CHAT_API, {

        method: "POST",



        headers: {

            "Content-Type": "application/json",

            "X-Device-ID": deviceId

        },



        body: JSON.stringify({

            model: settings.model || "gpt-6-astra",

            messages,

            temperature: options.temperature ?? 0.8,

            max_tokens: options.maxTokens ?? 2048

        })

    });



    let data;



    try {

        data = await response.json();

    } catch {

        data = {

            error: await response.text()

        };

    }



    if (!response.ok) {

        if (response.status === 429) {

            const seconds = Number(data.retryAfter || 0);



            throw new Error(

                seconds

                    ? `limit reached. try again in ${Math.ceil(seconds / 60)} minutes.`

                    : "message limit reached."

            );

        }



        throw new Error(

            data.error?.message ||

            data.error ||

            data.message ||

            `request failed (${response.status})`

        );

    }



    return (

        data.choices?.[0]?.message?.content ||

        data.content?.[0]?.text ||

        data.output_text ||

        ""

    );

}



async function sendMessage() {

    if (sending) return;



    const text = promptEl.value.trim();



    if (!text && !images.length && !pdf) return;



    if (!usePrompt()) return;



    let session = getSession();



    if (!session) session = createSession();



    const message = {

        id: id("user"),

        role: "user",

        content: text,

        images: [...images],

        pdfName: pdf?.name || null,

        pdfText: pdf?.text || null,

        ts: Date.now()

    };



    session.messages.push(message);



    const first =

        session.messages.filter(x => x.role === "user").length === 1;



    promptEl.value = "";

    images = [];

    pdf = null;



    renderAttachments();

    saveSessions();

    renderMessages();

    resizePrompt();



    sending = true;

    sendButton.disabled = true;



    appendTyping();



    if (first && text) {

        generateTitle(session, text);

    }



    try {

        const answer = await api(apiHistory(session, message));



        removeTyping();



        session.messages.push({

            id: id("assistant"),

            role: "assistant",

            content: answer || "no response returned.",

            ts: Date.now()

        });



        saveSessions();

        renderMessages();



    } catch (error) {

        removeTyping();



        session.messages.push({

            id: id("assistant"),

            role: "assistant",

            content: `**error:** ${error.message}`,

            ts: Date.now()

        });



        saveSessions();

        renderMessages();



    } finally {

        sending = false;

        updateSend();

    }

}



async function generateTitle(session, text) {

    try {

        const title = await api([

            {

                role: "system",

                content: "Create a short conversation title. Maximum 4 words. Return only the title."

            },

            {

                role: "user",

                content: text.slice(0, 500)

            }

        ], {

            temperature: .3,

            maxTokens: 20

        });



        if (!title) return;



        session.title = title

            .replace(/^["']|["']$/g, "")

            .trim()

            .slice(0, 55);



        saveSessions();

        renderHistory();



        if (session.id === currentId) {

            $("title").textContent = session.title;

        }



    } catch {

        session.title = text.slice(0, 35);



        saveSessions();

        renderHistory();

    }

}



function addImages(files) {

    [...files].forEach(file => {

        if (!file.type.startsWith("image/")) return;



        if (file.size > 8 * 1024 * 1024) {

            toast("image is too large");

            return;

        }



        const reader = new FileReader();



        reader.onload = () => {

            images.push(reader.result);

            renderAttachments();

            updateSend();

        };



        reader.readAsDataURL(file);

    });

}



function renderAttachments() {

    let html = images.map((src, index) => `

        <div class="attachment">

            <img src="${src}" alt="">

            <button class="attachment-remove" data-image="${index}">×</button>

        </div>

    `).join("");



    if (pdf) {

        html += `

            <div class="attachment pdf-attachment">

                <span>PDF · ${escapeHTML(pdf.name)}</span>

                <button class="attachment-remove" data-pdf="1">×</button>

            </div>

        `;

    }



    attachmentsEl.innerHTML = html;



    attachmentsEl.querySelectorAll("[data-image]").forEach(button => {

        button.onclick = () => {

            images.splice(Number(button.dataset.image), 1);

            renderAttachments();

            updateSend();

        };

    });



    attachmentsEl.querySelector("[data-pdf]")?.addEventListener("click", () => {

        pdf = null;

        renderAttachments();

        updateSend();

    });

}



async function uploadPDF(file) {

    if (!file) return;



    if (file.size > 15 * 1024 * 1024) {

        toast("pdf is too large");

        return;

    }



    toast("reading pdf...");



    try {

        const base64 = await fileToBase64(file);



        const response = await fetch(PDF_API, {

            method: "POST",



            headers: {

                "Content-Type": "application/json",

                "X-Device-ID": deviceId

            },



            body: JSON.stringify({

                name: file.name,

                data: base64

            })

        });



        const data = await response.json();



        if (!response.ok) {

            throw new Error(data.error || "could not read pdf");

        }



        pdf = {

            name: file.name,

            text: data.text

        };



        renderAttachments();

        updateSend();



        toast("pdf ready");



    } catch (error) {

        toast(error.message);

    }

}



function fileToBase64(file) {

    return new Promise((resolve, reject) => {

        const reader = new FileReader();



        reader.onload = () => {

            resolve(String(reader.result).split(",")[1]);

        };



        reader.onerror = reject;

        reader.readAsDataURL(file);

    });

}



async function startScreenShare() {
    if (!navigator.mediaDevices?.getDisplayMedia) { toast("screen sharing is not supported"); return; }
    try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 10 }, audio: false });
        const video = $("screenVideo");
        video.srcObject = screenStream;
        await video.play();
        screenStream.getVideoTracks()[0].addEventListener("ended", () => stopScreenShare(false));
        await openScreenPip();
        $("screenButton").classList.add("active");
    } catch {
        stopScreenShare(false);
        toast("screen sharing cancelled");
    }
}

async function openScreenPip() {
    let win;

    if (window === window.top) {
        if (!("documentPictureInPicture" in window)) {
            throw new Error("document picture-in-picture is not supported");
        }

        win = await window.documentPictureInPicture.requestWindow({
            width: 480,
            height: 420
        });
    } else {
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error("document picture-in-picture request timed out"));
            }, 5000);

            const handler = event => {
                if (event.source !== window.parent) return;

                if (event.data?.type === "celestial-screen-pip-ready") {
                    cleanup();
                    resolve();
                }

                if (event.data?.type === "celestial-screen-pip-error") {
                    cleanup();
                    reject(new Error(event.data.message || "document picture-in-picture failed"));
                }
            };

            const cleanup = () => {
                clearTimeout(timeout);
                window.removeEventListener("message", handler);
            };

            window.addEventListener("message", handler);

            window.parent.postMessage({
                type: "celestial-screen-pip-open"
            }, "*");
        });

        throw new Error("parent owns document picture-in-picture");
    }

    screenPipWindow = win;
    win.document.head.innerHTML = `<meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;background:#08090c;color:#fff;font-family:system-ui;overflow:hidden}#app{height:100%;display:flex;flex-direction:column}#bar{display:flex;align-items:center;gap:8px;padding:8px;background:#111;border-bottom:1px solid rgba(255,255,255,.3)}#dot{width:7px;height:7px;border-radius:50%;background:#7ee787}#name{flex:1;font-size:12px;opacity:.6}button{background:#222;color:#fff;border:1px solid rgba(255,255,255,.3);border-radius:7px;padding:6px 9px}#preview{height:150px;background:#000}canvas{width:100%;height:100%;object-fit:contain}#chat{flex:1;overflow:auto;padding:10px;display:flex;flex-direction:column;gap:7px}.msg{max-width:88%;padding:8px 10px;border:1px solid rgba(255,255,255,.3);border-radius:8px;line-height:1.5}.user{align-self:flex-end;background:#222}.ai{align-self:flex-start;background:#111}#bottom{display:flex;gap:7px;padding:8px;background:#111;border-top:1px solid rgba(255,255,255,.3)}input{flex:1;min-width:0;background:rgba(255,255,255,.02);color:#fff;border:1px solid rgba(255,255,255,.3);border-radius:8px;padding:9px;outline:0}</style>`;
    win.document.body.innerHTML = `<div id="app"><div id="bar"><div id="dot"></div><div id="name">celestial AI · screen share</div><button id="toggle">hide preview</button><button id="stop">stop</button></div><div id="preview"><canvas id="canvas"></canvas></div><div id="chat"></div><div id="bottom"><input id="question" placeholder="ask about what's on your screen..."><button id="ask">ask</button></div></div>`;
    const canvas = win.document.getElementById("canvas");
    const preview = win.document.getElementById("preview");
    const question = win.document.getElementById("question");
    const chat = win.document.getElementById("chat");
    const draw = () => {
        const video = $("screenVideo");
        if (!screenPipWindow || screenPipWindow.closed || !screenStream) return;
        if (video.readyState >= 2 && video.videoWidth) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height); }
        screenFrameTimer = requestAnimationFrame(draw);
    };
    draw();
    const add = (text, role) => { const el = win.document.createElement("div"); el.className = `msg ${role}`; el.innerHTML = role === "ai" ? markdown(text) : escapeHTML(text); chat.appendChild(el); chat.scrollTop = chat.scrollHeight; return el; };
    const ask = async () => {
        const text = question.value.trim() || "what is on my screen?";
        if (!usePrompt()) return;
        question.value = ""; add(text, "user"); const thinking = add("thinking...", "ai");
        try {
            const answer = await api([{ role: "system", content: getSystemPrompt() }, { role: "user", content: [{ type: "image_url", image_url: { url: captureScreen() } }, { type: "text", text }] }], { screen: true, maxTokens: 1500 });
            thinking.innerHTML = markdown(answer);
        } catch (error) { thinking.textContent = error.message; }
    };
    win.document.getElementById("ask").onclick = ask;
    question.onkeydown = event => { if (event.key === "Enter") ask(); };
    win.document.getElementById("stop").onclick = () => stopScreenShare(true);
    win.document.getElementById("toggle").onclick = event => { const hidden = preview.style.display === "none"; preview.style.display = hidden ? "block" : "none"; event.currentTarget.textContent = hidden ? "hide preview" : "show preview"; };
    win.addEventListener("pagehide", () => { if (screenStream) stopScreenShare(false); });
    question.focus();
}

function stopScreenShare(closePip = true) {
    if (screenStream) screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
    cancelAnimationFrame(screenFrameTimer);
    screenFrameTimer = null;
    $("screenVideo").srcObject = null;
    $("screenButton").classList.remove("active");
    if (closePip && screenPipWindow && !screenPipWindow.closed) screenPipWindow.close();
    screenPipWindow = null;
}

function captureScreen() {
    const video = $("screenVideo");
    if (!video.videoWidth || !video.videoHeight) throw new Error("screen is not ready");
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1600 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", .72);
}

async function askScreen() {

    const question =

        $("screenQuestion").value.trim() ||

        "What is on my screen?";



    if (!screenStream) {

        toast("start screen sharing first");

        return;

    }



    if (!usePrompt()) return;



    $("screenAnswer").textContent = "thinking...";



    try {

        const screenshot = captureScreen();



        const answer = await api([

            {

                role: "system",

                content: getSystemPrompt()

            },

            {

                role: "user",

                content: [

                    {

                        type: "image_url",

                        image_url: {

                            url: screenshot

                        }

                    },

                    {

                        type: "text",

                        text: question

                    }

                ]

            }

        ], {

            screen: true,

            maxTokens: 1500

        });



        $("screenAnswer").innerHTML = markdown(answer);

        bindCodeCopy();



    } catch (error) {

        $("screenAnswer").textContent = error.message;

    }

}



function studySource() {

    const session = getSession();



    if (!session?.messages.length) {

        return "";

    }



    return session.messages

        .slice(-10)

        .map(message => `${message.role}: ${message.content}`)

        .join("\n\n")

        .slice(0, 20000);

}



async function makeFlashcards() {

    const source = studySource();



    if (!source) {

        toast("chat about something first");

        return;

    }



    if (!usePrompt()) return;



    $("studyTitle").textContent = "flashcards";

    $("studyContent").innerHTML = "generating...";

    $("studyOverlay").classList.add("open");



    try {

        const response = await api([

            {

                role: "system",

                content:

                    `Create flashcards from the supplied study material.



Return ONLY valid JSON.

No markdown.

No code fence.



Format:

[

  {"q":"question","a":"answer"}

]



Create 8 useful flashcards.`

            },

            {

                role: "user",

                content: source

            }

        ], {

            temperature: .4,

            maxTokens: 1600

        });



        const cards = parseJSON(response);



        showFlashcards(cards);



    } catch (error) {

        $("studyContent").textContent = error.message;

    }

}



function showFlashcards(cards) {

    if (!Array.isArray(cards) || !cards.length) {

        $("studyContent").textContent = "could not create flashcards";

        return;

    }



    let index = 0;

    let showingAnswer = false;



    function render() {

        const card = cards[index];



        $("studyContent").innerHTML = `

            <div class="flashcard" id="flashcard">

                <div class="flashcard-text">

                    ${escapeHTML(showingAnswer ? card.a : card.q)}

                </div>

            </div>



            <div class="study-controls">

                <button id="previousCard">previous</button>

                <button id="flipCard">

                    ${showingAnswer ? "question" : "answer"}

                </button>

                <button id="nextCard">next</button>

            </div>



            <div style="text-align:center;margin-top:10px;opacity:.4;font-size:11px">

                ${index + 1} / ${cards.length}

            </div>

        `;



        $("flashcard").onclick = () => {

            showingAnswer = !showingAnswer;

            render();

        };



        $("flipCard").onclick = () => {

            showingAnswer = !showingAnswer;

            render();

        };



        $("previousCard").onclick = () => {

            index = (index - 1 + cards.length) % cards.length;

            showingAnswer = false;

            render();

        };



        $("nextCard").onclick = () => {

            index = (index + 1) % cards.length;

            showingAnswer = false;

            render();

        };

    }



    render();

}



async function makeQuiz() {

    const source = studySource();



    if (!source) {

        toast("chat about something first");

        return;

    }



    if (!usePrompt()) return;



    $("studyTitle").textContent = "quiz";

    $("studyContent").innerHTML = "generating...";

    $("studyOverlay").classList.add("open");



    try {

        const response = await api([

            {

                role: "system",

                content:

                    `Create a quiz from the supplied study material.



Return ONLY valid JSON.

No markdown.

No code fence.



Format:

[

  {

    "q":"question",

    "options":["A","B","C","D"],

    "answer":0

  }

]



"answer" must be the zero-based index of the correct option.



Create 8 questions.`

            },

            {

                role: "user",

                content: source

            }

        ], {

            temperature: .4,

            maxTokens: 2200

        });



        const quiz = parseJSON(response);



        showQuiz(quiz);



    } catch (error) {

        $("studyContent").textContent = error.message;

    }

}



function showQuiz(quiz) {

    if (!Array.isArray(quiz) || !quiz.length) {

        $("studyContent").textContent = "could not create quiz";

        return;

    }



    const answers = new Array(quiz.length).fill(null);



    $("studyContent").innerHTML =

        quiz.map((question, qIndex) => `

            <div class="quiz-question">

                <h3>

                    ${qIndex + 1}. ${escapeHTML(question.q)}

                </h3>



                ${question.options.map((option, oIndex) => `

                    <button

                        class="quiz-option"

                        data-q="${qIndex}"

                        data-o="${oIndex}"

                    >

                        ${escapeHTML(option)}

                    </button>

                `).join("")}

            </div>

        `).join("") +

        `

            <button class="settings-save" id="gradeQuiz">

                grade quiz

            </button>



            <div class="quiz-result" id="quizResult"></div>

        `;



    document.querySelectorAll(".quiz-option").forEach(button => {

        button.onclick = () => {

            const q = Number(button.dataset.q);

            const o = Number(button.dataset.o);



            answers[q] = o;



            document.querySelectorAll(`[data-q="${q}"]`).forEach(item => {

                item.classList.remove("selected");

            });



            button.classList.add("selected");

        };

    });



    $("gradeQuiz").onclick = () => {

        let correct = 0;



        quiz.forEach((question, index) => {

            if (answers[index] === Number(question.answer)) {

                correct++;

            }

        });



        $("quizResult").textContent =

            `${correct} / ${quiz.length} correct`;

    };

}



function parseJSON(text) {

    let value = String(text).trim();



    value = value.replace(/^```json/i, "");

    value = value.replace(/^```/, "");

    value = value.replace(/```$/, "");

    value = value.trim();



    const start = Math.min(

        ...["[", "{"]

            .map(char => value.indexOf(char))

            .filter(index => index >= 0)

    );



    if (Number.isFinite(start)) {

        value = value.slice(start);

    }



    return JSON.parse(value);

}



function resizePrompt() {

    promptEl.style.height = "auto";



    promptEl.style.height =

        Math.min(promptEl.scrollHeight, 170) + "px";



    updateSend();

}



function updateSend() {

    sendButton.disabled =

        sending ||

        (!promptEl.value.trim() && !images.length && !pdf);

}



function scrollBottom() {

    requestAnimationFrame(() => {

        messagesEl.scrollTop = messagesEl.scrollHeight;

    });

}



function openSettings() {

    $("modelInput").value = settings.model;

    $("aiName").value = settings.aiName;

    $("personality").value = settings.personality;

    $("systemPrompt").value = settings.systemPrompt;



    $("settingsOverlay").classList.add("open");

}



function saveSettings() {

    settings = {

        model: $("modelInput").value.trim() || "gpt-6-astra",

        aiName: $("aiName").value.trim() || "celestial",

        personality: $("personality").value,

        systemPrompt: $("systemPrompt").value.trim()

    };



    writeJSON(SETTINGS_KEY, settings);



    $("settingsOverlay").classList.remove("open");



    toast("settings saved");

}



$("newChat").onclick = () => {

    createSession();

    promptEl.value = "";

    images = [];

    pdf = null;

    renderAttachments();

    resizePrompt();

};



$("clearHistory").onclick = () => {

    sessions = [];

    localStorage.removeItem(SESSION_KEY);

    createSession();

};



$("settingsButton").onclick = openSettings;

$("saveSettings").onclick = saveSettings;



$("menu").onclick = () => {

    $("sidebar").classList.toggle("open");

};



$("send").onclick = sendMessage;



promptEl.oninput = resizePrompt;



promptEl.onkeydown = event => {

    if (event.key === "Enter" && !event.shiftKey) {

        event.preventDefault();

        sendMessage();

    }

};



$("imageButton").onclick = () => $("imageInput").click();



$("imageInput").onchange = event => {

    addImages(event.target.files);

    event.target.value = "";

};



$("pdfButton").onclick = () => $("pdfInput").click();



$("pdfInput").onchange = event => {

    uploadPDF(event.target.files[0]);

    event.target.value = "";

};



$("screenButton").onclick = event => {
    event.preventDefault();
    event.stopPropagation();
    window.open("./ss.html", "_blank");
};

$("askScreen").onclick = askScreen;



$("stopScreen").onclick = () => {

    stopScreenShare();

    $("screenOverlay").classList.remove("open");

};



$("flashcardsButton").onclick = makeFlashcards;

$("quizButton").onclick = makeQuiz;



document.querySelectorAll("[data-close]").forEach(button => {

    button.onclick = () => {

        const overlay = $(button.dataset.close);



        overlay.classList.remove("open");



        if (button.dataset.close === "screenOverlay") {

            stopScreenShare();

        }

    };

});



document.querySelectorAll(".overlay").forEach(overlay => {

    overlay.addEventListener("click", event => {

        if (event.target !== overlay) return;



        overlay.classList.remove("open");



        if (overlay.id === "screenOverlay") {

            stopScreenShare();

        }

    });

});



let dragDepth = 0;

document.addEventListener("dragenter", event => { event.preventDefault(); dragDepth++; $("dropOverlay").classList.add("open"); });
document.addEventListener("dragover", event => event.preventDefault());
document.addEventListener("dragleave", event => { event.preventDefault(); dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $("dropOverlay").classList.remove("open"); });
document.addEventListener("drop", event => {
    event.preventDefault();
    dragDepth = 0;
    $("dropOverlay").classList.remove("open");
    const files = [...event.dataTransfer.files];
    const imageFiles = files.filter(file => file.type.startsWith("image/"));
    const pdfFile = files.find(file => file.type === "application/pdf");
    if (imageFiles.length) addImages(imageFiles);
    if (pdfFile) uploadPDF(pdfFile);
});

if (sessions.length) {

    currentId = sessions[0].id;

    openSession(currentId);

} else {

    createSession();

}



lucide.createIcons();

updateLimit();

resizePrompt();

