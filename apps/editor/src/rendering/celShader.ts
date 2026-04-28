export const celCommonChunks = `
  uniform float celBands;
  uniform float celSoftness;
  uniform float celHatchStrength;
  uniform float celHatchScale;

  float getCelLighting(float diffuse) {
    float b = floor(diffuse * celBands);
    float f = fract(diffuse * celBands);
    float soft = smoothstep(0.5 - celSoftness, 0.5 + celSoftness, f);
    return (b + soft) / celBands;
  }

  float getHatching(vec2 pos, float lighting) {
    float hatch = sin((pos.x + pos.y) * celHatchScale * 100.0);
    hatch += sin((pos.x - pos.y) * celHatchScale * 70.0);
    hatch = smoothstep(-0.1, 0.1, hatch);
    return mix(1.0, hatch, (1.0 - lighting) * celHatchStrength);
  }
`;
