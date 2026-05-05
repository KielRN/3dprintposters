import { OrderDetail } from "@/components/OrderDetail";

type OrderPageProps = {
  params: Promise<{
    orderId: string;
  }>;
};

export default async function OrderPage({ params }: OrderPageProps) {
  const { orderId } = await params;

  return (
    <main className="min-h-screen bg-[var(--page-bg)] px-5 py-5 text-[var(--ink)] sm:px-7 lg:px-10">
      <div className="mx-auto w-full max-w-5xl">
        <OrderDetail orderId={orderId} />
      </div>
    </main>
  );
}
