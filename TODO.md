# TODO - Whitelabel Live Demo Portfolio (Kian Simpul Makna)

- [x] Refactor `app/components/UmrahForm.jsx` per requirements:
  - [ ] Retain upper header contact card (visual coordinator info) for cobrand.
  - [ ] Remove SFC input fields, state, and validation enforcement (nama_sfc + whatsapp_sfc), while keeping projectPartner payload intact for /api/register.
  - [ ] Convert all step validation schemas to optional/transient demo rules: no blocking validation gates and no input mandatory checks.
  - [ ] Remove obsolete validation error guards and obsolete states/handlers tied to removed SFC enforcement.
  - [ ] Keep OCR endpoint usage (`/api/ocr-passport`) and submission endpoint (`/api/register`) intact.
  - [ ] Ensure final step has controlled `pdpAgreed` checkbox with the exact label text requested.
  - [ ] Disable final submit button when `!pdpAgreed` with Tailwind disabled styling.
  - [ ] Remove any occurrences of the words "(Opsional)" or "Opsional" from labels/placeholders/subtexts inside this component.
  - [ ] Verify JSX bracket integrity and hooks are only at top-level.


