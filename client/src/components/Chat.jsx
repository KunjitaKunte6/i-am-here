import { useEffect, useRef, useState } from "react";
import { signOut } from "firebase/auth";
import { addDoc, collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { auth, db } from "../firebase";
import { askCompanion } from "../api";

export default function Chat({ user }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);

  const messagesRef = collection(db, "users", user.uid, "messages");

  // Live-subscribe to this user's last 100 messages, oldest first.
  useEffect(() => {
    const q = query(messagesRef, orderBy("createdAt", "asc"), limit(100));
    const unsubscribe = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.uid]);

  // Keep the newest message in view.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  async function handleSend(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || thinking) return;

    setInput("");
    setError("");
    setThinking(true);

    try {
      // 1. Save the user's message.
      await addDoc(messagesRef, { role: "user", content: text, createdAt: Date.now() });

      // 2. Send recent history + the new message to our server.
      const history = [
        ...messages.map(({ role, content }) => ({ role, content })),
        { role: "user", content: text },
      ];
      const reply = await askCompanion(history);

      // 3. Save the companion's reply.
      await addDoc(messagesRef, { role: "assistant", content: reply, createdAt: Date.now() });
    } catch (err) {
      setError(err.message);
    } finally {
      setThinking(false);
    }
  }

  const firstName = user.displayName?.split(" ")[0];

  return (
    <div className="chat">
      <header className="chat-header">
        <div className="brand">
          <span className="lamp small" aria-hidden="true" />
          I Am Here
        </div>
        <button className="link" onClick={() => signOut(auth)}>Sign out</button>
      </header>

      <main className="messages" aria-live="polite">
        {messages.length === 0 && !thinking && (
          <div className="empty">
            <p>{firstName ? `Hi ${firstName}.` : "Hi."} How are you feeling today?</p>
            <p className="muted">Say anything. There's no wrong way to start.</p>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`bubble ${m.role}`}>
            {m.content}
          </div>
        ))}

        {thinking && <div className="bubble assistant typing">Listening…</div>}
        {error && <p className="error" role="alert">{error}</p>}
        <div ref={bottomRef} />
      </main>

      <form className="composer" onSubmit={handleSend}>
        <textarea
          rows={1}
          value={input}
          placeholder="Type how you're feeling…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) handleSend(e);
          }}
          aria-label="Message"
        />
        <button type="submit" disabled={!input.trim() || thinking}>Send</button>
      </form>
    </div>
  );
}
