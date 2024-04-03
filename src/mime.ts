import { parse } from "content-type";

export class Mime {
  type: string;
  media: string;
  subtype: string;
  protocol: string;
  suffix: string | null;
  params: Record<string, string>;

  constructor(mimeType: string) {
    const parsed = parse(mimeType);
    const [media, subtype] = parsed.type.split("/", 2);
    const [protocol, suffix] = parsed.type.split("+", 2);
    if (!media || !subtype || !protocol || !suffix) {
      throw new Error(`Invalid mime type.`);
    }
    this.type = parsed.type;
    this.media = media;
    this.subtype = subtype;
    this.protocol = protocol;
    this.suffix = suffix;
    this.params = parsed.parameters;
  }
}
