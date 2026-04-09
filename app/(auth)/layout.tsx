export default function AuthLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-secondary/30">
            <div className="w-full max-w-md px-4">
                <div className="flex justify-center mb-8">
                    <img
                        src="https://storage.googleapis.com/msgsndr/Zd3mW81lbIpC8mi06Cgf/media/682c6cc8e10a088724d26be6.png"
                        alt="Diego Ferreyra Inmobiliaria"
                        className="h-12 w-auto object-contain"
                    />
                </div>
                {children}
            </div>
        </div>
    )
}
