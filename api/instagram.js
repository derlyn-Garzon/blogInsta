import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const GRAPH_VERSION = process.env.INSTAGRAM_GRAPH_VERSION || 'v21.0';
const GRAPH_BASE = 'https://graph.instagram.com';
const DEFAULT_PER_PAGE = 6;
const MEDIA_FIELDS = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp';

// Cliente de servidor: usa la service role key y nunca se expone al navegador.
const supabaseServer = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// El access token OAuth se guarda cifrado en Supabase (AES-256-GCM).
// Formato almacenado: "<iv_hex>:<auth_tag_hex>:<ciphertext_hex>".
function descifrarToken(tokenAlmacenado) {
    const keyHex = process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY;
    if (!keyHex) {
        // Sin llave maestra configurada solo se admite texto plano (desarrollo).
        return tokenAlmacenado;
    }

    const [ivHex, tagHex, dataHex] = String(tokenAlmacenado).split(':');
    if (!ivHex || !tagHex || !dataHex) {
        throw new Error('Formato de token cifrado inválido');
    }

    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        Buffer.from(keyHex, 'hex'),
        Buffer.from(ivHex, 'hex')
    );
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));

    return Buffer.concat([
        decipher.update(Buffer.from(dataHex, 'hex')),
        decipher.final(),
    ]).toString('utf8');
}

// La API Graph entrega las publicaciones paginadas (paging.next). Para poder
// ordenar el conjunto completo en orden ascendente hay que recorrer todas las páginas.
async function obtenerTodasLasPublicaciones(instagramUserId, accessToken) {
    const publicaciones = [];
    let url = `${GRAPH_BASE}/${GRAPH_VERSION}/${instagramUserId}/media` +
        `?fields=${MEDIA_FIELDS}&limit=100&access_token=${encodeURIComponent(accessToken)}`;

    while (url) {
        const respuesta = await fetch(url);
        const cuerpo = await respuesta.json();

        if (!respuesta.ok || cuerpo.error) {
            throw new Error(cuerpo.error?.message || `Error de la API de Instagram (${respuesta.status})`);
        }

        publicaciones.push(...(cuerpo.data || []));
        url = cuerpo.paging?.next || null;
    }

    return publicaciones;
}

export default async function handler(req, res) {
    try {
        // El cliente/desarrollador define de qué cuenta se extraen las publicaciones.
        const instagramUserId =
            req.query.user || req.query.instagram_user_id || process.env.INSTAGRAM_USER_ID;

        if (!instagramUserId) {
            return res.status(400).json({ error: 'Falta el identificador de Instagram del cliente' });
        }

        const paginaSolicitada = Math.max(1, parseInt(req.query.page, 10) || 1);
        const porPagina = Math.min(50, Math.max(1, parseInt(req.query.perPage, 10) || DEFAULT_PER_PAGE));

        // 1. Obtener el token cifrado de la conexión OAuth guardada en Supabase.
        const { data, error } = await supabaseServer
            .from('instagram_oauth_config')
            .select('access_token')
            .eq('instagram_user_id', instagramUserId)
            .single();

        if (error) {
            return res.status(502).json({ error: 'No se pudo leer la configuración OAuth de Supabase' });
        }
        if (!data?.access_token) {
            return res.status(404).json({ error: 'Token no encontrado para este usuario' });
        }

        const accessToken = descifrarToken(data.access_token);

        // 2. Traer todas las publicaciones de la cuenta.
        const todasLasPublicaciones = await obtenerTodasLasPublicaciones(instagramUserId, accessToken);

        // 3. Orden ASCENDENTE: de la más antigua a la más reciente.
        todasLasPublicaciones.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        // 4. Paginación sobre el conjunto completo ya ordenado.
        const totalPaginas = Math.max(1, Math.ceil(todasLasPublicaciones.length / porPagina));
        const paginaActual = Math.min(paginaSolicitada, totalPaginas);
        const inicio = (paginaActual - 1) * porPagina;
        const publicacionesPaginadas = todasLasPublicaciones.slice(inicio, inicio + porPagina);

        // 5. Responder con datos limpios en JSON.
        res.status(200).json({
            posts: publicacionesPaginadas,
            currentPage: paginaActual,
            totalPages: totalPaginas,
            totalPosts: todasLasPublicaciones.length,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
