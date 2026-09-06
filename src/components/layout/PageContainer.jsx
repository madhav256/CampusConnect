export default function PageContainer({
  children,
  className = "",
  maxWidth = "max-w-5xl",
  id = "main-content",
}) {
  return (
    <main
      id={id}
      tabIndex="-1"
      className={`mx-auto ${maxWidth} px-4 py-6 sm:px-6 sm:py-8 lg:px-8 outline-none ${className}`}
    >
      {children}
    </main>
  );
}

