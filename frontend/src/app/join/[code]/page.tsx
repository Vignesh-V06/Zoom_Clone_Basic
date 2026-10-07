import JoinForm from "@/components/JoinForm";
export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <div className="join-page page-width"><JoinForm initialCode={decodeURIComponent(code)} /></div>;
}
