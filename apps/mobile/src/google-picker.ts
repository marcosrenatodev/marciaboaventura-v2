import type { z } from "zod";
import { GooglePickerSessionSchema } from "@marcia/contracts";

type GooglePickerSession = z.infer<typeof GooglePickerSessionSchema>;
type PickerDocument = { id: string; name?: string; mimeType?: string };
type PickerResult = { action: string; docs?: PickerDocument[] };
type DocsView = { setIncludeFolders(value: boolean): DocsView; setMimeTypes(value: string): DocsView };
type Picker = { setVisible(value: boolean): void };
type PickerBuilder = {
  addView(view: DocsView): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setOrigin(origin: string): PickerBuilder;
  setCallback(callback: (result: PickerResult) => void): PickerBuilder;
  build(): Picker;
};
type PickerApi = {
  DocsView: new () => DocsView;
  PickerBuilder: new () => PickerBuilder;
  Action: { PICKED: string; CANCEL: string };
  ViewId: { DOCS: string };
};
type Gapi = {
  load(name: string, options: { callback: () => void; onerror: () => void; ontimeout: () => void; timeout: number }): void;
  picker?: PickerApi;
};

declare global {
  interface Window { gapi?: Gapi }
}

function loadGooglePickerApi(): Promise<PickerApi> {
  return new Promise((resolve, reject) => {
    const finish = () => {
      const gapi = window.gapi;
      if (!gapi) { reject(new Error("Não foi possível abrir o seletor do Google.")); return; }
      gapi.load("picker", {
        callback: () => gapi.picker ? resolve(gapi.picker) : reject(new Error("O seletor do Google não carregou.")),
        onerror: () => reject(new Error("Não foi possível carregar o seletor do Google.")),
        ontimeout: () => reject(new Error("O seletor do Google demorou demais para responder.")),
        timeout: 12_000,
      });
    };
    if (window.gapi) { finish(); return; }
    const existing = document.querySelector<HTMLScriptElement>('script[data-marcia-google-picker="true"]');
    if (existing) {
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener("error", () => { existing.remove(); reject(new Error("Não foi possível carregar o seletor do Google.")); }, { once: true });
      if (window.gapi) finish();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.dataset.marciaGooglePicker = "true";
    script.onload = finish;
    script.onerror = () => { script.remove(); reject(new Error("Não foi possível carregar o seletor do Google.")); };
    document.head.append(script);
  });
}

export async function openGooglePdfPicker(
  value: unknown,
  onSelected: (file: PickerDocument) => void,
): Promise<void> {
  const session: GooglePickerSession = GooglePickerSessionSchema.parse(value);
  const pickerApi = await loadGooglePickerApi();
  const view = new pickerApi.DocsView().setIncludeFolders(false).setMimeTypes("application/pdf,application/vnd.google-apps.document");
  let picker: Picker | null = null;
  picker = new pickerApi.PickerBuilder()
    .addView(view)
    .setOAuthToken(session.accessToken)
    .setDeveloperKey(session.developerKey)
    .setOrigin(window.location.origin)
    .setCallback((result) => {
      if (result.action === pickerApi.Action.PICKED && result.docs?.[0]?.id) onSelected(result.docs[0]);
      if (result.action === pickerApi.Action.PICKED || result.action === pickerApi.Action.CANCEL) {
        picker?.setVisible(false);
        picker = null;
      }
    })
    .build();
  picker.setVisible(true);
}
