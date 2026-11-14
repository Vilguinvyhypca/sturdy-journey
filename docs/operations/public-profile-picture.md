# Public profile picture

`https://hymecymeyseh.fun/profile-picture.png` serves the explicitly published
avatar as a static PNG. It allows cross-origin embedding and anonymous CORS
requests, so other websites can display it as a profile picture.

The initial file is a copy of the image selected by the owner, media ID
`local:a4bb8a71-6ccf-406f-8f81-45e7e0d735bb`. It is intentionally independent
of the media catalog: hiding or deleting the original does not remove this
public copy. Replace or remove `public/profile-picture.png` and deploy a new
release to change or withdraw it. External websites may retain their own copies.

The cross-origin headers apply only to this exact path. Existing media API
authorization and embedding restrictions remain in place.
