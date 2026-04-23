---
name: glsl-syntax-validator
description: "Validate GLSL changes in slimesurfers. Use for embedded shader strings, Three.js ShaderMaterial code, onBeforeCompile fragment injections, uniform/varying mismatches, and syntax or scope errors in apps/game/client/src/shaders/shaders.ts."
argument-hint: "Describe the shader change, material, or GLSL block you want validated"
---

# GLSL Syntax Validator

Use this skill when you need to review or fix shader syntax in slimesurfers before or after editing GLSL, including nearby Three.js wiring that can break shader compilation.

In this repo, shader code currently lives primarily in embedded template strings inside `apps/game/client/src/shaders/shaders.ts`, including both direct `THREE.ShaderMaterial` programs and `onBeforeCompile` patch injections into Three.js built-in materials.

## What This Skill Produces

- A syntax-focused review of the affected GLSL blocks
- Checks for uniform, varying, function, and preprocessor consistency
- Extra validation for `onBeforeCompile` string replacement patches
- Small, safe fixes when the syntax defect is clear
- A recommendation for whether static review is enough or a runtime compile smoke-check is needed

## Validation Procedure

1. Identify the shader delivery path first.
   Decide whether the change is in:
   - a standalone `vertexShader` or `fragmentShader` string passed to `THREE.ShaderMaterial`
   - an `onBeforeCompile` injection that rewrites an existing Three.js shader chunk
   - a shared GLSL helper function embedded in a larger shader string

2. Read the full assembled shader context, not just the edited snippet.
   For standalone shader strings, inspect the matching vertex and fragment pair together. For `onBeforeCompile`, inspect the added declarations, the replacement target, and any later injected block that depends on variables introduced earlier.

3. Check basic GLSL syntax before reasoning about behavior.
   Verify:
   - balanced braces, parentheses, and preprocessor blocks
   - semicolons on declarations and statements
   - legal constructor calls and function signatures
   - no accidental TypeScript or JavaScript syntax inside GLSL strings
   - valid use of built-ins like `mix`, `clamp`, `pow`, `smoothstep`, `fract`, `sin`, `dot`, and `normalize`

4. Validate interface consistency across shader stages.
   Confirm:
   - every `varying` written in the vertex shader is declared compatibly in the fragment shader
   - every `uniform` used in GLSL is actually provided by the material or injected into `shader.uniforms`
   - attribute usage matches the material and geometry assumptions

5. Treat `onBeforeCompile` patches as string-assembly problems, not just GLSL problems.
   For replacement-based patches, check:
   - the replacement anchor string actually exists in the upstream Three.js shader source
   - injected declarations are prepended before first use
   - variables introduced in one replacement remain in scope for later replacements
   - `#ifdef` and other preprocessor guards still wrap complete valid blocks
   - the final shader remains syntactically valid after concatenation and replacement

6. Check Three.js-specific shader expectations.
   Confirm the shader still respects the conventions expected by the material type:
   - `gl_Position` is written in vertex shaders
   - `gl_FragColor` is written in fragment shaders for this codebase's GLSL style
   - built-in varyings or defines referenced by injected code are actually available for that material path
   - mesh/material settings such as transparency, depth flags, and side selection do not require different shader assumptions

7. Treat runtime compilation as the normal second step for non-trivial edits.
   Static review is often enough for very small self-contained syntax edits. For most non-trivial changes, follow static validation with a runtime compile smoke-check, especially when the change:
   - alters `onBeforeCompile` injections
   - depends on built-in material chunks or defines
   - adds new uniforms or varyings
   - changes control flow in a way that could produce compile-time type errors only after full assembly

8. Use the repo toolchain for surrounding validation.
   Run `vp check` for TypeScript-level safety around the shader wiring. If a runtime smoke-check is needed, exercise the affected material or scene path in the client so WebGL compilation can fail visibly. This repo does not currently include a dedicated standalone GLSL validator dependency, so runtime compilation may be the decisive check for assembled shaders.

9. Apply narrow fixes when the defect is obvious.
   Safe fixes include missing semicolons, mismatched declarations, wrong uniform names, out-of-scope injected variables, broken replacement anchors, and other local syntax issues. Avoid rewriting shader behavior or visual design unless the prompt explicitly asks for it.

## Decision Rules

### If the shader is a plain ShaderMaterial string

- Validate the vertex and fragment strings as a pair.
- Check all uniforms and varyings against the material constructor.
- Prefer static validation first, then a runtime compile check if the change is non-trivial.

### If the shader uses onBeforeCompile

- Validate the injected header and every replacement block together.
- Confirm replacement anchors still match the target Three.js chunks.
- Assume a runtime compile smoke-check is warranted unless the edit is extremely small.

### If a variable is used across injected blocks

- Confirm the earlier replacement introduces it in a scope still visible later.
- Flag the change if ordering or guards make the variable conditional or unavailable.

### If the error might actually be wiring rather than GLSL syntax

- Check the material's `uniforms`, config references, and TypeScript glue code before concluding the shader text is wrong.
- Distinguish TypeScript-side wiring bugs from GLSL parse or compile bugs.

## Completion Criteria

Do not consider the validation complete until you can state all of the following:

- The full assembled shader path was identified.
- Syntax checks covered declarations, control flow, and delimiters.
- Uniform and varying interfaces were reviewed end to end.
- `onBeforeCompile` replacements were checked for anchor validity and scope safety when applicable.
- A runtime compile smoke-check was recommended or performed when static review alone was insufficient.
- Findings or fixes point to concrete compile risks or likely visual breakage.

## Suggested Prompts

- `/glsl-syntax-validator check this fragment shader for syntax and uniform mismatches`
- `/glsl-syntax-validator validate the onBeforeCompile injections in createSlimeMaterial`
- `/glsl-syntax-validator review whether these varying declarations match across stages`
- `/glsl-syntax-validator audit this shader edit and tell me if static review is enough or if I need a runtime compile check`
