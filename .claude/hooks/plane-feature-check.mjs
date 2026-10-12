#!/usr/bin/env node
// UserPromptSubmit hook: when a prompt asks for a new feature or spec, remind the agent to run
// the plane-feature-check skill before anything else. Prints nothing for other prompts.

// Words are matched whole with Unicode letter boundaries (`\b` does not handle accented letters).
const FEATURE_TERMS = [
  "features?",
  "fonctionnalit[ée]s?",
  "specs?",
  "sp[ée]cifications?",
  "speckit[-.]specify",
  "impl[ée]ment\\p{L}*",
  "user stor(?:y|ies)",
  "[ée]pics?",
  "nouvelles? (?:page|vue|option|[ée]cran|propri[ée]t[ée])s?",
  "new (?:page|view|screen|option|property)s?",
  "ajouter? la possibilit[ée]",
  "add support for",
];
const FEATURE_PATTERN = new RegExp(`(?<!\\p{L})(?:${FEATURE_TERMS.join("|")})(?!\\p{L})`, "iu");

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  let prompt = "";
  try {
    prompt = JSON.parse(input).prompt ?? "";
  } catch {
    return;
  }
  if (!FEATURE_PATTERN.test(prompt)) return;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext:
          "This prompt may request a new feature or spec. Before writing any spec, plan or code, run the " +
          "plane-feature-check skill to find out whether Plane offers this feature (Community Edition or a paid " +
          "plan). The project does not build features Plane does not offer: if it is not in Plane, stop and explain " +
          "that, as the skill says. Skip only for bug " +
          "fixes, refactors, tooling or docs, or if the check already ran for this feature in this session.",
      },
    })
  );
});
