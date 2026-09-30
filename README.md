# I Am Here

An AI companion web app. You sign in, talk, and a warm, attentive companion replies. Your conversation is saved, so it's still there when you come back.

**Stack:** React (Vite) · Firebase Auth · Cloud Firestore · Node.js + Express · Gemini API

## How it fits together

```
React app ──(1) sign in──────────────▶ Firebase Auth
   │
   ├──(2) save/read messages─────────▶ Firestore  users/{uid}/messages
   │
   └──(3) POST /api/chat + ID token──▶ Express server
                                         ├─ verifies the token (firebase-admin)
                                         └─ calls Gemini API with the secret key
```

- The Gemini API key lives **only on the server**. The browser never sees it.
- The server only answers requests that carry a valid Firebase ID token, so random people can't use up the API credits.
- Firestore security rules let each user read and write **only their own** messages.

## Setup

You need Node.js 18+, a Firebase project, and a free Gemini API key from https://aistudio.google.com.

### 1. Firebase
1. Create a project at https://console.firebase.google.com
2. **Authentication → Sign-in method →** enable **Email/Password**.
3. **Firestore Database →** create a database, then paste `firestore.rules` into the **Rules** tab and publish.
4. **Project settings → Your apps →** add a Web app and copy its config values.

### 2. Server
```bash
cd server
cp .env.example .env      # fill in GEMINI_API_KEY and FIREBASE_PROJECT_ID
npm install
npm run dev               # http://localhost:5000
```

### 3. Client
```bash
cd client
cp .env.example .env      # fill in the Firebase web config values
npm install
npm run dev               # http://localhost:5173
```

## Project structure
```
server/
  index.js            Express app: auth check, input cleanup, Gemini call
client/src/
  firebase.js         Firebase init (auth + Firestore)
  api.js              Calls the server with the user's ID token
  App.jsx             Shows Login or Chat depending on auth state
  components/Login.jsx
  components/Chat.jsx Live message list (onSnapshot) + composer
firestore.rules       Per-user access rules
```
