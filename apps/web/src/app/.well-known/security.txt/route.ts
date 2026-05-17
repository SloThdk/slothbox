// RFC 9116 security.txt — standardised contact for vulnerability disclosure.
//
// Served at /.well-known/security.txt. Security researchers and automated
// scanners look here before opening a public issue. Keeping the contact
// + policy at the canonical location is what makes "responsible
// disclosure" the path of least resistance for a finder.
//
// The Expires field is mandatory under RFC 9116 §2.5.5 — file must be
// re-signed / re-published before that date. We pick 1 year out and
// renew at every major release.
//
// References:
//   - https://www.rfc-editor.org/rfc/rfc9116
//   - https://securitytxt.org/

export const dynamic = "force-static";

export function GET(): Response {
  const body = [
    "# SlothBox vulnerability disclosure",
    "# https://github.com/SloThdk/slothbox",
    "",
    "Contact: mailto:philipsloth1@gmail.com",
    "Contact: https://philipsloth.com/contact",
    "Expires: 2027-05-18T00:00:00.000Z",
    "Preferred-Languages: en, da",
    "Canonical: https://slothbox.philipsloth.com/.well-known/security.txt",
    "Policy: https://github.com/SloThdk/slothbox/blob/master/SECURITY.md",
    "Acknowledgments: https://github.com/SloThdk/slothbox/blob/master/CONTRIBUTORS.md",
    "",
    "# This file is unsigned. We may publish a PGP-signed variant at",
    "# /.well-known/security.txt.sig once the maintainer PGP key is",
    "# published (see SECURITY.md for the disclosure SLA).",
    "",
  ].join("\n");

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, must-revalidate",
    },
  });
}
