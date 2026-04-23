export interface KillFeedTemplate {
  id: string;
  text: string;
}

export const KILL_LEXICON = {
  generic: [
    { id: "generic-slimed", text: "{attacker} slimed {victim}" },
    { id: "generic-styled", text: "{attacker} styled on {victim}" },
    { id: "generic-folded", text: "{victim} got folded by {attacker}" },
    { id: "generic-erased", text: "{victim} was erased by {attacker}" },
    { id: "generic-spawn", text: "{attacker} sent {victim} back to spawn" },
    { id: "generic-dunked", text: "{victim} got dunked by {attacker}" },
  ],
  machineGun: [
    { id: "mg-peppered", text: "🔫 {attacker} peppered {victim}" },
    { id: "mg-stitched", text: "🔫 {attacker} stitched up {victim}" },
    { id: "mg-ventilated", text: "🔫 {victim} got ventilated by {attacker}" },
    { id: "mg-hosed", text: "🔫 {attacker} hosed down {victim}" },
    { id: "mg-shredded", text: "🔫 {victim} got shredded by {attacker}" },
    { id: "mg-mist", text: "🔫 {attacker} turned {victim} into mist" },
  ],
  bazooka: [
    { id: "bazooka-goo", text: "💥 {attacker} blasted {victim} into goo" },
    { id: "bazooka-rocket", text: "💥 {victim} ate the whole rocket from {attacker}" },
    { id: "bazooka-nextweek", text: "💥 {attacker} launched {victim} into next week" },
    { id: "bazooka-boomified", text: "💥 {victim} got boomified by {attacker}" },
    { id: "bazooka-loud", text: "💥 {attacker} deleted {victim} the loud way" },
    { id: "bazooka-negotiate", text: "💥 {victim} could not negotiate with {attacker}'s bazooka" },
  ],
  sniper: [
    { id: "sniper-picked", text: "🎯 {attacker} picked off {victim}" },
    { id: "sniper-deleted", text: "🎯 {victim} got deleted by {attacker}" },
    { id: "sniper-filthy", text: "🎯 {attacker} landed a filthy shot on {victim}" },
    { id: "sniper-dotted", text: "🎯 {victim} got dotted by {attacker}" },
    { id: "sniper-disappear", text: "🎯 {attacker} made {victim} disappear" },
    { id: "sniper-timeline", text: "🎯 {victim} was removed from the timeline by {attacker}" },
  ],
  self: [
    { id: "self-outplayed", text: "☠️ {victim} outplayed themself" },
    { id: "self-incident", text: "☠️ {victim} had a tragic slime incident" },
    { id: "self-fumbled", text: "☠️ {victim} fumbled the landing" },
    { id: "self-forgot", text: "☠️ {victim} forgot step two" },
    { id: "self-physics", text: "☠️ {victim} lost a fight with physics" },
    { id: "self-gooped", text: "☠️ {victim} gooped themself" },
  ],
  orphaned: [
    { id: "orphaned-popped", text: "☠️ {victim} popped" },
    { id: "orphaned-chaos", text: "☠️ {victim} lost to the chaos" },
    { id: "orphaned-ranout", text: "☠️ {victim} ran out of options" },
  ],
} as const satisfies Record<string, readonly KillFeedTemplate[]>;

export type KillFeedBucket = keyof typeof KILL_LEXICON;
