import { listDocuments } from "@/lib/documents";

export const dynamic = "force-dynamic";

export async function GET() {
  const documents = await listDocuments();
  return Response.json({ documents });
}
