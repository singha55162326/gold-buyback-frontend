Optional: the shop's own artwork.

The logo in the UI is drawn as vector in src/components/logo.tsx, so nothing is
required here. To use the original artwork instead, put it in this folder and
point the app at it:

  frontend/public/brand/logo.png      <- the file (transparent background)
  .env:  NEXT_PUBLIC_LOGO_SRC=/brand/logo.png

Every place the mark appears (rail, login, mobile header) picks it up. Left
unset, the app requests no asset at all.
