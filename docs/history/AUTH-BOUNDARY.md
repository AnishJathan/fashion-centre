# Future WhatsApp OTP authentication

Latest user direction: the shopper enters a phone number/country code, receives an outbound OTP on WhatsApp, and enters that code in Fashion Centre. This supersedes the earlier user-sends-a-message concept.

Authentication is intentionally absent from this runnable increment. Profile links to a clearly labelled UI simulation at `/#/login`: phone entry, code entry, invalid/expired code, delivery-failure simulation, resend cooldown, change number, cancellation and demo success. The displayed demo code `123456` creates no session. Entered numbers stay in component memory, are never persisted or sent, and are discarded when leaving the screen. No WhatsApp messages are sent.

Future Java API boundary:

- `POST /api/auth/whatsapp/challenges` accepts a validated E.164 phone number and requests delivery through an approved provider. Return an opaque challenge ID, expiry and resend-after time; never return the OTP.
- `POST /api/auth/whatsapp/challenges/{id}/verify` accepts the entered code. Only successful server-side verification can establish a session. Opening WhatsApp is never verification.
- `POST /api/auth/whatsapp/challenges/{id}/resend` enforces resend limits and invalidates or reconciles the prior challenge according to the provider contract.
- Changing number/cancelling invalidates pending local challenge state. UI needs waiting, invalid code, expired code, delivery failure, resend cooldown and recovery states.

Before live implementation: settle provider, approved delivery templates, consent, abuse/rate limits, challenge attempt limits, secure session cookies, OTP hashing/retention, account recovery and phone-number reassignment. Secrets and verification stay in Java; frontend never authorises itself with a hardcoded demo OTP.
