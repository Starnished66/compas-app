/** Return the sole release certificate digest across apksigner output formats. */
function apksignerCertificateSha256(output) {
  const digests = [...output.matchAll(/^\s*(?:Signer #\d+ certificate|V[0-9.]+ Signer: certificate) SHA-256 digest: ([0-9a-fA-F]{64})\s*$/gm)]
    .map((match) => match[1].toLowerCase());
  const unique = [...new Set(digests)];
  return unique.length === 1 ? unique[0] : null;
}

module.exports = { apksignerCertificateSha256 };
