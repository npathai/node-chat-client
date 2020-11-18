// Login Selectors
const loginBtn = document.getElementById("login")
const userName = document.getElementById("username")
const sender = document.getElementById("sender")
const login = document.querySelector(".login")
const chatWindow = document.querySelector(".chat-window")
const conversationListItems = document.querySelector(".conversation-list-items")
const loggedInUser = document.querySelector("#current-user")

// Login Event Handler
loginBtn.addEventListener("click", loginUser)
let loggedInUsername;

function loginUser() {
    let name = userName.value
    let xmlhttp = new XMLHttpRequest();
    xmlhttp.onreadystatechange = function () {
        if (xmlhttp.readyState === XMLHttpRequest.DONE) {
            let response = JSON.parse(xmlhttp.response)
            // let response = xmlhttp.responseText
            console.log("response: ", response);
            if (xmlhttp.status === 200) {
                loggedInUsername = response.username
                login.setAttribute("hidden", "");
                chatWindow.removeAttribute("hidden")
                loggedInUser.innerText = response.username
                getDropDown()
                createSocket()
                loadConversations()
            }
            else if (xmlhttp.status === 500) {
                alert(response.error);
            }
        }
    }
    xmlhttp.open("POST", `http://localhost:3000/api/users/login`, true);
    xmlhttp.setRequestHeader('Content-Type', 'application/json');
    xmlhttp.setRequestHeader('Accept', 'application/json');
    xmlhttp.send(JSON.stringify({username: name}));
    userName.value = ""
}

// Chat window Selectors
// FIXME remove use of this. It just should be used to search a user
let receiver = document.getElementById("receiver")
let messageArea = document.querySelector(".message-area")
let inputText = document.getElementById("inputTextMessage")
let sendButton = document.getElementById("send")

// let loggedInUsername = location.search.substring(1).split("=")[1];

// Get all users for dropdown from DB
let users = []
function getDropDown() {
    let xmlhttp = new XMLHttpRequest();
    xmlhttp.onreadystatechange = function () {
        if (xmlhttp.readyState === XMLHttpRequest.DONE) {
            let response = JSON.parse(xmlhttp.response)
            // let response = xmlhttp.responseText
            if (xmlhttp.status === 200) {
                users = [...response.data]
                // FIXME remove self
                // Drop down list of all contacts/users
                for (user of users) {
                    if (user.name === loggedInUsername) {
                        continue;
                    }
                    let userkey = document.createElement("option")
                    userkey.innerText = user.name
                    userkey.value = user.name
                    receiver.appendChild(userkey)
                    receiver.addEventListener("change", function (event) {
                        let conversation = getExistingConversationOrCreate(event.target.value)
                        showConversation(conversation)
                    })
                }
            }
            else if (xmlhttp.status >= 400) {
                alert(response.error);
            }
        }
    }
    xmlhttp.open("GET", `http://localhost:3000/api/users/`, true);
    xmlhttp.setRequestHeader('Content-Type', 'application/json');
    xmlhttp.setRequestHeader('Accept', 'application/json');
    xmlhttp.send({});
}

// Socket integration
let socket = undefined

function createSocket() {
    socket = new WebSocket("ws://localhost:3000")

    console.log("socket: ", socket);

    socket.onopen = function() {
        socket.send(JSON.stringify({
            type: "bind",
            username: loggedInUsername
        }))
    }

// Chat window Event Handler
    sendButton.addEventListener("click", () => {
        // emit only if message is not empty
        if (inputText.value) {
            let messageData = {
                type: 'message', message: inputText.value, senderName: loggedInUsername, date: Date.now(), conversationId: currentConversationId
            }
            postMessage(messageData)
            inputText.value = ""
        }
    })

    // Listen to socket emitted from server
    socket.onmessage = function (event) {
        console.log("Received back at client: '" + event.data + "'");
        let message = JSON.parse(event.data)
        addConversation(message.conversationId, message, "incoming")
        scrollToBottom()
    }
}

postMessage = (messageData) => {

    let conversation = getExistingConversation(messageData.conversationId)

    let xmlhttp = new XMLHttpRequest();
    xmlhttp.onreadystatechange = function () {
        if (xmlhttp.readyState === XMLHttpRequest.DONE) {
            let response = JSON.parse(xmlhttp.response)
            if (xmlhttp.status === 200) {
                addConversation(conversation._id, messageData, "outgoing")
                scrollToBottom()
            }
            else if (xmlhttp.status >= 400) {
                alert(response.error);
            }
        }
    }
    xmlhttp.open("POST", `http://localhost:3000/api/conversations/${conversation._id}/message`, true);
    xmlhttp.setRequestHeader('Content-Type', 'application/json');
    xmlhttp.setRequestHeader('Accept', 'application/json');
    xmlhttp.send(JSON.stringify({senderName: messageData.senderName, message: messageData.message}));
}

getExistingConversationOrCreate = (receiverName) => {
    let existingConversation
    for (let conversationId of Object.keys(conversationsById)) {
        let conversation = conversationsById[conversationId]
        if (conversation.members[0] === receiverName) {
            existingConversation = conversation
            break
        }
    }

    if (existingConversation === undefined) {
        let xmlhttp = new XMLHttpRequest();
        xmlhttp.onreadystatechange = function () {
            if (xmlhttp.readyState === XMLHttpRequest.DONE) {
                let response = JSON.parse(xmlhttp.response)
                if (xmlhttp.status === 200) {
                    saveConversation(response)
                    existingConversation = response
                    reloadConversationsUI()
                }
                else if (xmlhttp.status >= 400) {
                    alert(response.error);
                }
            }
        }
        xmlhttp.open("POST", `http://localhost:3000/api/conversations`, false);
        xmlhttp.setRequestHeader('Content-Type', 'application/json');
        xmlhttp.setRequestHeader('Accept', 'application/json');
        xmlhttp.send(JSON.stringify({members: [receiverName, loggedInUsername]}));
    }

    return existingConversation
}

getExistingConversation = (conversationId) => {
    let existingCoversation = conversationsById[conversationId]

    if (existingCoversation === undefined) {
        let xmlhttp = new XMLHttpRequest();
        xmlhttp.onreadystatechange = function () {
            if (xmlhttp.readyState === XMLHttpRequest.DONE) {
                let response = JSON.parse(xmlhttp.response)
                if (xmlhttp.status === 200) {
                    existingCoversation = response
                    saveConversation(response)
                    reloadConversationsUI()
                }
                else if (xmlhttp.status >= 400) {
                    alert(response.error);
                }
            }
        }
        xmlhttp.open("GET", `http://localhost:3000/api/conversations/${conversationId}`, false);
        xmlhttp.setRequestHeader('Content-Type', 'application/json');
        xmlhttp.setRequestHeader('Accept', 'application/json');
        xmlhttp.send({});
    }

    return existingCoversation
}

let conversationsById = {}
let currentConversationId

function saveConversation(conversation) {
    conversation.members = conversation.members.filter((value, index, arr) => {
        return value !== loggedInUsername
    })
    conversationsById[conversation._id] = conversation
}

loadConversations = () => {
    let xmlhttp = new XMLHttpRequest();
    xmlhttp.onreadystatechange = function () {
        if (xmlhttp.readyState === XMLHttpRequest.DONE) {
            let response = JSON.parse(xmlhttp.response)
            if (xmlhttp.status === 200) {
                for (let conversation of response) {
                    saveConversation(conversation);
                }
                reloadConversationsUI()
            }
            else if (xmlhttp.status >= 400) {
                alert(response.error);
            }
        }
    }
    xmlhttp.open("GET", `http://localhost:3000/api/users/${loggedInUsername}/conversations`, true);
    xmlhttp.setRequestHeader('Content-Type', 'application/json');
    xmlhttp.setRequestHeader('Accept', 'application/json');
    xmlhttp.send({});
}

addConversation = (conversationId, messageData, typeOfMsg) => {
    let conversation = conversationsById[conversationId]
    if (conversation === undefined) {
        getExistingConversation(conversationId)
        conversation = conversationsById[conversationId]
    }

    conversation.messages.push({fromName: messageData.senderName, message: messageData.message})

    if (conversationId === currentConversationId) {
        appendMessage(messageData, typeOfMsg)
        // FIXME check if we need below if now?
    } else if (messageData.senderName === loggedInUsername) {
        appendMessage(messageData, typeOfMsg)
    } else {
        highlightUnreadConversation(conversationId)
    }
}

appendMessage = (messageData, typeOfMsg) => {
    let newMessage = document.createElement("div")
    let newText = document.createElement("div")
    let className = typeOfMsg
    newText.classList.add(className, "message")
    newText.innerHTML = messageData.message
    messageArea.appendChild(newText)
}

showConversation = (conversation) => {
    inactive(currentConversationId)
    currentConversationId = conversation._id
    active(currentConversationId)
    messageArea.innerHTML = ''
    for (let message of conversation.messages) {
        if (message.fromName === loggedInUsername) {
            appendMessage(message, "outgoing")
        } else {
            appendMessage(message, "incoming")
        }
    }
}

highlightUnreadConversation = (conversationId) => {
    let conversationSelector = document.getElementById(conversationId)
    conversationSelector.classList.add('conversation-item-unread')
}

inactive = (conversationId) => {
    if (conversationId === undefined) {
        return
    }
    let conversationSelector = document.getElementById(conversationId)
    conversationSelector.classList.remove('conversation-item-active')
}

active = (conversationId) => {
    let conversationSelector = document.getElementById(conversationId)
    conversationSelector.classList.add('conversation-item-active')
    conversationSelector.classList.remove('conversation-item-unread')
}

scrollToBottom = () => {
    messageArea.scrollTop = messageArea.scrollHeight
}

reloadConversationsUI = () => {
    conversationListItems.innerHTML = ''
    if (conversationsById === undefined) {
        return
    }

    Object.keys(conversationsById).forEach(key => {
        let conversation = conversationsById[key]
        let element = document.createElement("li")
        element.id = conversation._id
        element.className = "conversation-item"
        element.innerText = conversation.members.join(",")
        element.addEventListener("click", function(event) {
            let targetConversation = conversationsById[event.target.id]
            showConversation(targetConversation)
        })
        conversationListItems.appendChild(element)
    })
}