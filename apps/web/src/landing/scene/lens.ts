/** The line of three's bokeh shader that says how far out of focus a pixel is, and the one put in its place. */
const blur = 'float factor = ( focus + viewZ );'
const blurButTheDark = 'float factor = getDepth( vUv ) < 0.99999 ? focus + viewZ : 0.0;'

/**
 * The fragment shader of three's depth of field (`BokehPass`), changed so
 * the dark beyond the scene, which is at no distance, is left as it is and
 * nothing in focus bleeds into it.
 *
 * The addon has no setting for it, so one line of its shader is replaced.
 * Should an upgrade of three reword that line the replacement would do
 * nothing, silently, and the dark would be blurred like anything far away:
 * so it fails instead, here and in `lens.test.ts`, which runs it against
 * three's own shader.
 */
export function darkLeftSharp(fragmentShader: string): string {
  if (!fragmentShader.includes(blur)) {
    throw new Error(`three's bokeh shader no longer has the line the Landing's scene replaces in it: "${blur}". See scene/lens.ts.`)
  }
  return fragmentShader.replace(blur, blurButTheDark)
}
