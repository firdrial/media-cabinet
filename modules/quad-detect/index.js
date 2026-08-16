import { requireNativeModule } from 'expo-modules-core';

let nativeModule = null;

try {
  nativeModule = requireNativeModule('QuadDetect');
} catch (e) {
  console.warn(
    '[QuadDetect] Native module unavailable:',
    e?.message || e
  );
}

console.log(
  '[QuadDetect] wrapper v6 - clipped perspective warp with corner radius support'
);

export async function detectQuad(uri, initQuad) {
  if (
    !nativeModule ||
    typeof nativeModule.detectQuad !== 'function'
  ) {
    return null;
  }

  try {
    const flatGuess = initQuad
      ? initQuad.flatMap((p) => [
          Number(p.x),
          Number(p.y),
        ])
      : null;

    return await nativeModule.detectQuad(
      uri,
      flatGuess
    );

  } catch (e) {

    console.warn(
      '[QuadDetect] native detect failed:',
      e?.message || e
    );

    return null;
  }
}

export async function warpQuad(
  uri,
  cornersNorm,
  outW,
  outH,
  flipV = false,
  cornerRadiusPx = 0 // <-- Added for Blu-ray rounded corners
) {
  if (
    !nativeModule ||
    typeof nativeModule.warpQuad !== 'function'
  ) {
    throw new Error(
      'QuadDetect.warpQuad native function is unavailable'
    );
  }

  if (
    !uri ||
    !Array.isArray(cornersNorm) ||
    cornersNorm.length !== 4
  ) {
    throw new Error(
      'warpQuad requires an image URI and four corners'
    );
  }

  try {

    const flat =
      cornersNorm.flatMap((p) => [
        Number(p.x),
        Number(p.y),
      ]);

    return await nativeModule.warpQuad(
      uri,
      flat,
      Math.round(outW),
      Math.round(outH),
      Boolean(flipV),
      Math.round(cornerRadiusPx) // <-- Pass down to native
    );

  } catch (e) {

    console.error(
      '[QuadDetect] native warp failed:',
      e?.message || e
    );

    throw e;
  }
}