import { test } from "bun:test";
import { expectJsonHelpOption } from "../../_helpers/cliHelpers";

test("pop info --help shows --json option", () => expectJsonHelpOption(["pop", "info"]));

test("pop status --help shows --json option", () => expectJsonHelpOption(["pop", "status"]));
