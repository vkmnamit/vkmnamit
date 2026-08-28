
  # Student Management System

  This is a code bundle for Student Management System. The original project is available at https://www.figma.com/design/5PBnX8NmLilVZ1dYZ7gTg8/Student-Management-System.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.

  ## Environment

  The WhatsApp connection flow uses the Meta JavaScript SDK from the frontend. Set these values in the frontend environment:

  - `VITE_API_URL` for the backend API base URL.
  - `VITE_META_APP_ID` for the public Meta App ID used to initialize the SDK.
  - `VITE_META_WHATSAPP_CONFIG_ID` for the WhatsApp Embedded Signup config ID used by `FB.login`.
  - `VITE_META_SDK_VERSION` for the Meta JavaScript SDK version to load and initialize.
  - `VITE_META_SDK_URL` for the Meta JavaScript SDK script URL.
  - `VITE_VAPID_PUBLIC_KEY` for browser push subscriptions.
  