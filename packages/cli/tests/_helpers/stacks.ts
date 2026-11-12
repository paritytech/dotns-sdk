import { publish, type Descriptor, type Model } from "@parity/trinity-stack";

/** `descriptor` published as a document signed with `secret`, sequenced at `now`. */
export async function signDescriptor(
  descriptor: Descriptor,
  secret: Uint8Array,
  now?: Date,
): Promise<Uint8Array> {
  const model: Partial<Descriptor> = { ...descriptor };
  delete model.$v;
  delete model.sequence;
  delete model.generation;
  return (await publish(model as Model, { generation: "0x01", secret, now })).document;
}
