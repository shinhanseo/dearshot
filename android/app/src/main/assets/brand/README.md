# Social login brand assets

Downloaded 2026-10-12 from official provider resources. The symbols are not redrawn or generated.

## Kakao

- Design guide: https://developers.kakao.com/docs/ko/kakaologin/design-guide
- Original SVG: https://developers.kakao.com/tool/images/resource/preview/login-complete-ko.svg
- Local original: `kakao_login_source.svg`
- Runtime asset: `res/drawable/ic_kakao_login.xml`

The first SVG path is the speech-bubble symbol. Its path and fill are unchanged; the VectorDrawable group translates it into a tight 13 × 13 viewport. Container and localized label are Compose UI: #FEE500, black label at 85% opacity, system font. No Kotlin Canvas or hand-authored logo geometry is used.

## Google

- Branding guide: https://developers.google.com/identity/branding-guidelines
- Official SVG example: https://developers.google.com/static/identity/images/branding_guideline_sample_nt_sq_sl.svg
- Local original: `google_login_source.svg`
- Runtime asset: `res/drawable/ic_google_login.xml`

The four Google G paths and fills are copied unchanged from the official SVG example, translated into a 20 × 20 viewport. The neutral container is #F2F2F2 and label is #1F1F1F. Compose renders the drawable with `Image` to preserve its original colors.

The Google Sans font source is https://github.com/google/fonts/tree/main/ofl/googlesans. `res/font/google_sans_medium.ttf` is a static weight-500, optical-size-14, grade-0 Latin subset of `GoogleSans[GRAD,opsz,wght].ttf` (U+0020–U+00FF); Korean glyphs use the Android font fallback. The SIL OFL license is packaged at `assets/licenses/google-sans-OFL.txt`.

Original SVGs are provenance sources, not runtime SVG dependencies. Android uses the converted VectorDrawables through `painterResource`, so this change does not add Coil or an SVG decoding library. Source assets retain their provider branding ownership.

Disabled buttons retain their provider background and logo colors, dim their label and expose disabled button semantics. The production screen keeps social login disabled until its authentication flow is connected; previews enable it to review the design.
