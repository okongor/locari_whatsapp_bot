export default function Home() {
  return (
    <main style={{ fontFamily: "sans-serif", padding: 24 }}>
      <h1>Locari WhatsApp Bot</h1>
      <p>
        This app has no user-facing pages — it exposes a webhook at{" "}
        <code>/api/whatsapp/webhook</code> for the WhatsApp Cloud API.
      </p>
    </main>
  );
}
