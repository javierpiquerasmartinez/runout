import { BokehShader } from 'three/addons/shaders/BokehShader.js'
import { describe, expect, it } from 'vitest'
import { darkLeftSharp } from './lens'

describe("the lens's shader, patched to leave the dark beyond the scene as it is", () => {
  // Against three's own shader: an upgrade that rewrites the line the patch replaces fails here.
  it("patches the shader three's depth of field comes with", () => {
    const patched = darkLeftSharp(BokehShader.fragmentShader)

    expect(patched).not.toBe(BokehShader.fragmentShader)
    expect(patched).toContain('getDepth( vUv ) < 0.99999 ? focus + viewZ : 0.0')
    expect(patched).not.toContain('float factor = ( focus + viewZ );')
  })

  it('fails, saying what it looked for, on a shader that has no such line', () => {
    expect(() => darkLeftSharp('void main() { gl_FragColor = vec4( 1.0 ); }')).toThrow('float factor = ( focus + viewZ );')
  })
})
