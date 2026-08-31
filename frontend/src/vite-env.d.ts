/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_API_URL?: string;
    readonly VITE_META_APP_ID?: string;
    readonly VITE_META_WHATSAPP_CONFIG_ID?: string;
    readonly VITE_META_SDK_VERSION?: string;
    readonly VITE_META_SDK_URL?: string;
    readonly VITE_VAPID_PUBLIC_KEY?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

declare global {
    interface Window {
        FB?: {
            init: (options: {
                appId: string;
                cookie?: boolean;
                xfbml?: boolean;
                version?: string;
            }) => void;
            login: (
                callback: (response: any) => void,
                options?: Record<string, unknown>,
            ) => void;
        };
        fbAsyncInit?: () => void;
    }
}

export { };