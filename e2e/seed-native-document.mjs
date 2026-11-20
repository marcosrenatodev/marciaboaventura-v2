const apiBaseUrl = process.env.MARCIA_E2E_API_BASE_URL ?? "http://127.0.0.1:8787";
const webOrigin = process.env.MARCIA_E2E_WEB_BASE_URL ?? "http://127.0.0.1:8081";
const name = process.env.MARCIA_E2E_NAME;
const email = process.env.MARCIA_E2E_EMAIL;
const password = process.env.MARCIA_E2E_PASSWORD;
const setupToken = process.env.MARCIA_E2E_SETUP_TOKEN;

if (![name, email, password, setupToken].every((value) => typeof value === "string" && value.length > 0)) {
  throw new Error("Native E2E synthetic account inputs are missing.");
}

const setupResponse = await fetch(`${apiBaseUrl}/api/setup/owner`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: webOrigin },
  body: JSON.stringify({ name, email, password, setupToken }),
});
if (!setupResponse.ok) {
  throw new Error(`Could not create the disposable native E2E account (HTTP ${setupResponse.status}).`);
}

const cookies = setupResponse.headers.getSetCookie?.().map((cookie) => cookie.split(";", 1)[0]).join("; ");
if (!cookies) throw new Error("The local auth response did not provide a session cookie for fixture setup.");

const pdfBytes = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n", "utf8");
const form = new FormData();
form.set("file", new File([pdfBytes], "native-fixture.pdf", { type: "application/pdf" }));
form.set("fileName", "Fixture E2E — documento sintético");
const uploadResponse = await fetch(`${apiBaseUrl}/api/documents`, {
  method: "POST",
  headers: { Cookie: cookies, Origin: webOrigin },
  body: form,
});
if (uploadResponse.status !== 201) {
  throw new Error(`Could not seed the synthetic native E2E PDF (HTTP ${uploadResponse.status}).`);
}

console.log("Seeded one synthetic encrypted PDF for the disposable native E2E account.");
