# Channels in TIA Studio

Channels connect external conversations to the same embedded Pi runtime used by the desktop app. There is no Assistant or Claw layer between a channel and Pi.

## Runtime behavior

For each inbound remote conversation, TIA Studio:

1. authenticates or pairs the sender when the adapter requires it;
2. normalizes the inbound message;
3. creates or resumes one persistent Pi thread in the built-in Chats workspace;
4. runs that thread with Standard Access through the application-owned runtime; and
5. sends Pi's response back through the source channel.

Repeated messages from the same channel and remote chat reuse the same binding. Permission requests remain visible in the corresponding desktop thread.

## Supported connections

| Channel  | Setup                 | Pairing | Group mention control | Image delivery |
| -------- | --------------------- | ------- | --------------------- | -------------- |
| Discord  | Bot token             | —       | Yes                   | Yes            |
| Lark     | App ID and app secret | —       | Yes                   | Yes            |
| Telegram | Bot token             | Yes     | —                     | Yes            |
| WhatsApp | QR sign-in            | Yes     | Yes                   | Yes            |
| WeChat   | QR sign-in            | —       | —                     | No             |
| WeCom    | Bot ID and secret     | —       | Yes                   | No             |

Create and manage connections from **Settings → Channels**. The page reports connection state, QR authentication state where applicable, pairing counts, and adapter errors without exposing saved credentials.

## Group behavior

Discord, Lark, WhatsApp, and WeCom expose a `groupRequireMention` setting. It defaults to `true`, so a group message triggers Pi only when the bot is explicitly mentioned. Disabling it allows every supported group message on that connection to trigger a response.

Telegram does not expose this group toggle. WhatsApp and Telegram use pairing approval for unknown direct-message senders.

## Channel commands

- `/new` closes the current binding's Pi session and starts a new thread.
- `/stop` cancels the active run for the bound thread. If no run is active, the channel reports that nothing is running.

All other messages continue the currently bound thread. If Pi fails, the channel returns a concise error and the desktop thread retains the detailed state.

## Security boundary

- Channel credentials remain in Electron main and local application storage.
- Channel threads use Standard Access; a remote message cannot silently enable Full Access.
- The renderer and external adapters use application-owned schemas rather than Pi SDK objects.
- The built-in Chats directory begins empty and does not receive injected identity, memory, soul, prompt, or preboot files.
