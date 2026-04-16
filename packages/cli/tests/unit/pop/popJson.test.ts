import { test } from "bun:test";
import { expectJsonHelpOption } from "../../_helpers/cliHelpers";

test("pop set --help shows --json option", () => expectJsonHelpOption(["pop", "set"]));

test("pop info --help shows --json option", () => expectJsonHelpOption(["pop", "info"]));
