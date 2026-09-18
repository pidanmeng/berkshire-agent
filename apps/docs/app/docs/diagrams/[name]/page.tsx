import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { diagrams } from '@/lib/shared';
import { DiagramPanel } from '@/components/diagram-panel';

export function generateStaticParams() {
  return diagrams.map((d) => ({ name: d.name }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ name: string }>;
}): Promise<Metadata> {
  const { name } = await params;
  const d = diagrams.find((x) => x.name === name);
  return d
    ? { title: d.title, description: d.description }
    : { title: '图 · 不存在' };
}

export default async function Page({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  const d = diagrams.find((x) => x.name === name);
  if (!d) notFound();

  return (
    <main className="mx-auto w-full max-w-[1150px] px-6 py-8">
      <DiagramPanel name={d.name} title={d.title} description={d.description} />
    </main>
  );
}