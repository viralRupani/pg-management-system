import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as Handlebars from "handlebars";

export interface RenderedEmail {
  html: string;
  text: string;
}

/**
 * Compiles Handlebars email templates and renders them to an HTML + plain-text
 * pair. The model is intentionally simple and reusable:
 *
 *   - `layout.hbs`        the shared HTML shell (header, card, footer). The one
 *                         place a content body is injected, via `{{{body}}}`.
 *   - `<name>.hbs`        a content fragment, injected into the layout body.
 *   - `<name>.text.hbs`   the hand-written plain-text twin (better for
 *                         deliverability than auto-stripping HTML).
 *
 * Adding a new email = drop those two files in `templates/` and call
 * `render("<name>", data)`. Everything is compiled ONCE at boot.
 */
@Injectable()
export class MailTemplateService implements OnModuleInit {
  private readonly logger = new Logger(MailTemplateService.name);
  private readonly dir = join(__dirname, "templates");
  private readonly compiled = new Map<string, Handlebars.TemplateDelegate>();
  private layout!: Handlebars.TemplateDelegate;

  /**
   * Eager-compile EVERY template at boot. If the nest-cli asset copy didn't run
   * (i.e. `dist/mail/templates` is missing), this throws and the process fails
   * to start LOUDLY — instead of every email silently no-op'ing later inside
   * forgotPassword's deliberate failure-swallow. Doubles as a smoke test that
   * the `.hbs` files actually ship to `dist`.
   */
  onModuleInit(): void {
    const files = readdirSync(this.dir).filter((f) => f.endsWith(".hbs"));
    for (const file of files) {
      const source = readFileSync(join(this.dir, file), "utf8");
      const name = file.replace(/\.hbs$/, "");
      // HTML templates escape values (XSS-safe); plain-text twins must NOT —
      // Handlebars escapes `=`/`&` to HTML entities, which would corrupt a URL
      // in a text/plain body (clients don't decode entities there).
      const noEscape = name.endsWith(".text");
      this.compiled.set(name, Handlebars.compile(source, { noEscape }));
    }
    const layout = this.compiled.get("layout");
    if (!layout) {
      throw new Error("Email layout template missing (templates/layout.hbs)");
    }
    this.layout = layout;
    this.logger.log(`Compiled ${files.length} email templates from ${this.dir}`);
  }

  /**
   * Render a content template + its `.text` twin. The content HTML is injected
   * into the shared layout. `{{{body}}}` in the layout is the ONLY triple-stash
   * (it injects already-rendered, trusted HTML); every value inside the content
   * and text templates uses `{{ }}` and is auto-escaped.
   */
  render(name: string, data: Record<string, unknown>): RenderedEmail {
    const content = this.get(name)(data);
    const html = this.layout({ ...data, body: content });
    const text = this.get(`${name}.text`)(data);
    return { html, text };
  }

  private get(name: string): Handlebars.TemplateDelegate {
    const template = this.compiled.get(name);
    if (!template) throw new Error(`Unknown email template: ${name}`);
    return template;
  }
}
