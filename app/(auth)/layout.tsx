export default function AuthLayout({
    children,
}: {
    children: React.ReactNode
}) {
    // `min-h-dvh` y no `min-h-screen` (=100vh): en iOS Safari `vh` mide el
    // viewport GRANDE, ~110px más que lo visible con la barra de direcciones
    // puesta. Centrar contra esa caja dejaba la tarjeta de login ~55px más abajo
    // de donde va, con una barrita de scroll que no lleva a ningún lado. Se nota
    // más con el teclado abierto escribiendo la contraseña.
    return (
        <div className="min-h-dvh flex items-center justify-center bg-secondary/30">
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
