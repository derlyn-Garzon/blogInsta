import { createClient } from '@supabase/supabase-js';

// Conexión segura usando la llave maestra del servidor
const supabaseServer = createClient(
    process.env.SUPABASE_URL, 
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    try {
        const instagramUserId = 'TU_INSTAGRAM_USER_ID';
        const paginaActual = parseInt(req.query.page) || 1;
        const porPagina = 6; // Cantidad de posts por página

        // 1. Obtener el token cifrado desde Supabase
        const { data, error } = await supabaseServer
            .from('instagram_oauth_config')
            .select('access_token')
            .eq('instagram_user_id', instagramUserId)
            .single();

        if (error || !data) return res.status(404).json({ error: 'Token no encontrado' });

        // Aquí aplicas tu función de descifrado con la llave maestra de entorno
        const accessToken = data.access_token; 

        // 2. Consultar la API Graph de Instagram
        const respuesta = await fetch(`https://graph.instagram.com/v18.0/${instagramUserId}/media?fields=id,caption,media_url,permalink,timestamp&access_token=${accessToken}`);
        const resultado = await respuesta.json();

        let publicaciones = resultado.data || [];

        // 3. Ordenar las publicaciones en ORDEN ASCENDENTE (de más antigua a más reciente)
        publicaciones.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        // 4. Aplicar paginación
        const inicio = (paginaActual - 1) * porPagina;
        const fin = inicio + porPagina;
        const publicacionesPaginadas = publicaciones.slice(inicio, fin);
        const totalPaginas = Math.ceil(publicaciones.length / porPagina);

        // 5. Enviar los datos limpios en formato JSON al cliente
        res.status(200).json({
            posts: publicacionesPaginadas,
            currentPage: paginaActual,
            totalPages: totalPaginas
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
