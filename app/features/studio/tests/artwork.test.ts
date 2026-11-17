// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { artworkSize, svgSize } from '../utils/artwork'

// The artwork's size (plan §5.2, D35): the canvas and the customer's PNG take it.

describe('artworkSize', () => {
  it('keeps a size in range, scales a large one down to 2000 px on its long side, and refuses a small one', () => {
    expect(artworkSize(1200, 800)).toEqual({ width: 1200, height: 800 })
    expect(artworkSize(4000, 3000)).toEqual({ width: 2000, height: 1500 })
    expect(artworkSize(3000, 4500)).toEqual({ width: 1333, height: 2000 })
    expect(artworkSize(199, 800)).toBeUndefined()
    // Scaled down so far that its short side is under 200 px.
    expect(artworkSize(8000, 700)).toBeUndefined()
    expect(artworkSize(0, 0)).toBeUndefined()
  })
})

describe('svgSize', () => {
  it('reads width and height, else the viewBox, keeping the proportions when only one is given', () => {
    expect(svgSize('<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"/>')).toEqual({ width: 1080, height: 1350 })
    expect(svgSize('<svg xmlns="http://www.w3.org/2000/svg" width="1080px" height="1350px"/>')).toEqual({ width: 1080, height: 1350 })
    expect(svgSize('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900"/>')).toEqual({ width: 600, height: 900 })
    expect(svgSize('<svg xmlns="http://www.w3.org/2000/svg" width="1200" viewBox="0 0 600 900"/>')).toEqual({ width: 1200, height: 1800 })
    expect(svgSize('<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 600 900"/>')).toEqual({ width: 600, height: 900 })
  })

  it('has no size for markup that isn\'t an SVG, or an SVG with no size at all', () => {
    expect(svgSize('<html></html>')).toBeUndefined()
    expect(svgSize('<svg xmlns="http://www.w3.org/2000/svg"/>')).toBeUndefined()
  })
})
