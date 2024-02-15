import i18next from "i18next";
import {
  moment,
  Editor,
  EditorPosition,
  HeadingCache,
  ListItemCache,
  MarkdownView,
  Plugin,
  SectionCache,
  TFile,
} from "obsidian";
import * as en from "./locales/en.json";
import * as ko from "./locales/ko.json";

i18next.init({
  lng: moment.locale() || "en",
  fallbackLng: "en",
  resources: {
    en: { translation: en },
    ko: { translation: ko },
  },
});



function generateId(): string {
  return Math.random().toString(36).substring(2, 6);
}

const illegalHeadingCharsRegex = /[!"#$%&()*+,.:;<=>?@^`{|}~\/\[\]\\]/g;
function sanitizeHeading(heading: string) {
  return heading
    .replace(illegalHeadingCharsRegex, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shouldInsertAfter(block: ListItemCache | SectionCache) {
  if ((block as any).type) {
    return [
      "blockquote",
      "code",
      "table",
      "comment",
      "footnoteDefinition",
    ].includes((block as SectionCache).type);
  }
}

export default class MyPlugin extends Plugin {
  async onload() {
    console.info("loading block-link plugin");

    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor, view) => {
        const block = this.getBlock(editor, view.file);

        if (!block) return;

        const isHeading = !!(block as any).heading;

        const onClick = (isEmbed: boolean) => {
          if (isHeading) {
            this.handleHeading(view.file, block as HeadingCache, isEmbed);
          } else {
            this.handleBlock(
              view.file,
              editor,
              block as SectionCache | ListItemCache,
              isEmbed,
            );
          }
        };
        //
        menu.addItem((item) => {
          item
            .setTitle(
              isHeading
                ? i18next.t("copy_link_to_heading")
                : i18next.t("copy_link_to_block"),
            )
            .setIcon("links-coming-in")
            .onClick(() => onClick(false));
        });

        menu.addItem((item) => {
          item
            .setTitle(
              isHeading
                ? i18next.t("copy_heading_embed")
                : i18next.t("copy_block_embed"),
            )
            .setIcon("links-coming-in")
            .onClick(() => onClick(true));
        });
      }),
    );

    this.addCommand({
      id: "copy-link-to-block",
      name: "Copy link to current block or heading",
      editorCheckCallback: (isChecking, editor, view: MarkdownView) => {
        return this.handleCommand(isChecking, editor, view, false);
      },
    });

    this.addCommand({
      id: "copy-embed-to-block",
      name: "Copy embed to current block or heading",
      editorCheckCallback: (isChecking, editor, view: MarkdownView) => {
        return this.handleCommand(isChecking, editor, view, true);
      },
    });
  }

  handleCommand(
    isChecking: boolean,
    editor: Editor,
    view: MarkdownView,
    isEmbed: boolean,
  ) {
    if (isChecking) {
      return !!this.getBlock(editor, view.file);
    }

    const block = this.getBlock(editor, view.file);

    if (!block) return;

    const isHeading = !!(block as any).heading;

    if (isHeading) {
      this.handleHeading(view.file, block as HeadingCache, isEmbed);
    } else {
      this.handleBlock(
        view.file,
        editor,
        block as SectionCache | ListItemCache,
        isEmbed,
      );
    }
  }

  getBlock(editor: Editor, file: TFile) {
    const cursor = editor.getCursor("to");
    const fileCache = this.app.metadataCache.getFileCache(file);

    let block: ListItemCache | HeadingCache | SectionCache = (
      fileCache?.sections || []
    ).find((section) => {
      return (
        section.position.start.line <= cursor.line &&
        section.position.end.line >= cursor.line
      );
    });

    if (block?.type === "list") {
      block = (fileCache?.listItems || []).find((item) => {
        return (
          item.position.start.line <= cursor.line &&
          item.position.end.line >= cursor.line
        );
      });
    } else if (block?.type === "heading") {
      block = fileCache.headings.find((heading) => {
        return heading.position.start.line === block.position.start.line;
      });
    }

    return block;
  }

  handleHeading(file: TFile, block: HeadingCache, isEmbed: boolean) {
    const heading = sanitizeHeading(block.heading);
    const markdownLink = this.app.fileManager.generateMarkdownLink(
      file,
      "",
      "#" + heading,
      heading,
    );
    const headingLink = markdownLink.replace(
      /\[([^\]]+)\]\(([^\)]+)\)/,
      (match, p1, p2) => {
        return `[${p1}\#${heading}](${p2})`;
      },
    );
    console.log('headingLink', headingLink)
    navigator.clipboard.writeText(`${isEmbed ? "!" : ""}${headingLink}`);
  }

  handleBlock(
    file: TFile,
    editor: Editor,
    block: ListItemCache | SectionCache,
    isEmbed: boolean,
  ) {
    const blockId = block.id;

    // Copy existing block id
    if (blockId) {
      return navigator.clipboard.writeText(
        `${isEmbed ? "!" : ""}${this.app.fileManager.generateMarkdownLink(
          file,
          "",
          "#^" + blockId,
        )}`,
      );
    }

    // Add a block id
    const sectionEnd = block.position.end;
    const end: EditorPosition = {
      ch: sectionEnd.col,
      line: sectionEnd.line,
    };

    const id = generateId();
    const spacer = shouldInsertAfter(block) ? "\n\n" : " ";

    editor.replaceRange(`${spacer}^${id}`, end);
    navigator.clipboard.writeText(
      `${isEmbed ? "!" : ""}${this.app.fileManager.generateMarkdownLink(
        file,
        "",
        "#^" + id,
      )}`,
    );
  }
}
