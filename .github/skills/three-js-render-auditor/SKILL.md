---
name: three-js-render-auditor
description: "Audit Three.js rendering changes in slimesurfers. Use for scene graph ownership, material render states, shader integration, per-frame object churn, resource disposal, transparency ordering, and client-side rendering regressions."
argument-hint: "Describe the render change, scene path, or visual bug you want audited"
---

# Three.js Render Auditor

Use this skill when you need to review or fix rendering changes in slimesurfers's Three.js client.

This skill is for changes involving:

- `apps/game/client/src/scenes/**`
- `apps/game/client/src/systems/renderSystem.ts`
- `apps/game/client/src/systems/paintSystem.ts`
- `apps/game/client/src/systems/projectileSystem.ts`
- `apps/game/client/src/entities/**`
- `apps/game/client/src/shaders/shaders.ts`

## What This Skill Produces

- A render-focused audit of the affected scene, system, or material path
- Findings on correctness, render-state choices, hot-path performance, and GPU resource lifetime with equal weight on visual reliability and active-path efficiency
- A classification of whether the issue is scene graph wiring, material/shader behavior, update-loop churn, or disposal leakage
- Small, safe fixes when the rendering defect is clear
- A recommendation for the quickest useful runtime smoke-test path

## Audit Procedure

1. Identify the render path end to end.
   Trace the change through the actual client path:
   - scene construction and object creation
   - per-frame updates in the active loop
   - material or shader setup
   - cleanup or removal paths
     Do not audit a mesh or material in isolation if the bug is really in scene ownership or runtime updates.

2. Classify the problem type before proposing changes.
   Decide whether the primary risk is:
   - scene graph ownership
   - material or shader state
   - transparency, depth, or draw ordering
   - per-frame allocation or update churn
   - resource disposal and lifecycle leakage
   - config mismatch between gameplay scale and rendering assumptions

3. Check scene ownership and lifecycle.
   Confirm who creates, updates, and removes each object. For every mesh, material, texture, render target, or helper object touched by the change, verify there is a clear creation path and a matching removal or disposal path when the object becomes obsolete.

4. Audit render-state choices, not just geometry and color.
   Review settings such as:
   - `transparent`
   - `depthWrite`
   - `depthTest`
   - `blending`
   - `side`
   - `renderOrder`
   - `frustumCulled`
     Check whether the chosen combination matches the intended visual layering and avoids common transparency artifacts.

5. Validate shader and material integration.
   If the change touches `ShaderMaterial` or `onBeforeCompile`, confirm uniforms, textures, and material flags line up with the shader code. If the change uses a built-in material, check whether the chosen material type still matches the lighting and emissive behavior expected by the scene.

6. Treat hot-path performance as a first-class audit target.
   Review per-frame code for:
   - repeated geometry or material allocation
   - repeated mesh creation when reuse would work
   - unnecessary `Vector3`, `Color`, or other object churn in tight loops
   - repeated scene traversal or lookup that could be cached safely
     Be pragmatic: only flag churn that is in active render or update paths, not one-time setup code. Performance issues in the active path should be reported alongside correctness issues, not treated as an afterthought.

7. Check GPU resource lifetime explicitly.
   Removing a mesh from the scene is not enough if the geometry, material, texture, or render target should also be disposed. Audit disposal for:
   - player and projectile meshes
   - paint surfaces and textures
   - offscreen render targets
   - temporary shader materials used during baking
     If resources intentionally persist for reuse, note that clearly instead of flagging them automatically.

8. Keep rendering concerns in the client layer.
   Rendering should observe gameplay state, not become a hidden source of gameplay truth. If render code starts encoding authoritative state decisions or duplicating simulation logic, flag it and prefer a cleaner client/runtime boundary.

9. Recommend the smallest useful runtime validation.
   After static review, identify the fastest runtime check that would prove the fix or expose the regression, such as:
   - loading the match scene and orbiting around planet atmospheres or wireframes
   - joining a room and observing paint stamp rendering
   - forcing projectile spawn and cleanup
   - checking disconnect/reconnect or player removal paths for leaked objects

10. Apply narrow fixes when the root cause is clear.
    Safe fixes include disposal wiring, bad material flags, missing render-order settings, trivial hot-path allocations, incorrect shader hookups, and local cleanup bugs. Avoid redesigning the whole render stack unless the prompt explicitly asks for it.

## Decision Rules

### If the bug is visual layering or transparency

- Audit `transparent`, `depthWrite`, `depthTest`, `blending`, `side`, and `renderOrder` together.
- Check whether the object should render after opaque world geometry or ignore depth entirely.

### If the bug is a missing or stale visual update

- Trace the runtime ownership path first.
- Check whether the object is being updated from the right client state source and whether the material or texture needs explicit refresh behavior.

### If the bug appears after players, projectiles, or scene objects are removed

- Check scene removal and resource disposal separately.
- Flag code that only removes meshes from the scene while leaving GPU-backed resources alive without a reuse plan.

### If the change touches shaders

- Pair this audit with the GLSL validator mindset.
- Check not just shader syntax, but also render-state assumptions, uniforms, texture inputs, and runtime material usage.

### If the change affects performance

- Focus on the active render loop and object creation churn that happens frequently.
- Prefer small caching or reuse fixes over speculative optimization elsewhere.

## Completion Criteria

Do not consider the audit complete until you can state all of the following:

- The full render path was traced from creation to cleanup.
- Render-state choices were reviewed where visuals depend on layering or transparency.
- Shader or material wiring was checked when applicable.
- Hot-path allocations or update churn were reviewed pragmatically.
- Resource lifetime was checked for meshes and any GPU-backed assets involved.
- The recommended runtime smoke-test matches the affected visual path.
- Findings or fixes point to concrete visual regressions, leaks, or update-path bugs.

## Suggested Prompts

- `/three-js-render-auditor audit this scene change for render-state and disposal issues`
- `/three-js-render-auditor review projectile and player cleanup for mesh or material leaks`
- `/three-js-render-auditor check whether this transparency setup will render correctly`
- `/three-js-render-auditor trace this visual bug through the scene, material, and update loop`
