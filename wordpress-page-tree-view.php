<?php
/**
 * Plugin Name:       WordPress Page Tree View
 * Plugin URI:        https://github.com/example/wordpress-page-tree-view
 * Description:       Hierarchical tree view for WordPress pages, posts, and custom post types with drag-and-drop support.
 * Version:           1.0.0
 * Requires at least: 6.0
 * Requires PHP:      8.0
 * Author:            WordPress Tree View
 * License:           GPL-2.0-or-later
 * Text Domain:       wordpress-page-tree-view
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

define( 'WPTV_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'WPTV_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'WPTV_VERSION', '1.0.0' );

/**
 * Register the admin menu page.
 */
function wptv_add_admin_menu(): void {
    add_menu_page(
        __( 'Tree View', 'wordpress-page-tree-view' ),
        __( 'Tree View', 'wordpress-page-tree-view' ),
        'edit_pages',
        'wordpress-page-tree-view',
        'wptv_render_admin_page',
        'dashicons-list-view',
        20
    );
}
add_action( 'admin_menu', 'wptv_add_admin_menu' );

/**
 * Render the admin page HTML shell.
 */
function wptv_render_admin_page(): void {
    echo '<div id="wptv-root"></div>';
}

/**
 * Enqueue plugin scripts and styles on the plugin admin page.
 */
function wptv_enqueue_assets( string $hook_suffix ): void {
    if ( 'toplevel_page_wordpress-page-tree-view' !== $hook_suffix ) {
        return;
    }

    $asset_file = WPTV_PLUGIN_DIR . 'build/index.asset.php';

    if ( ! file_exists( $asset_file ) ) {
        return;
    }

    $asset = require $asset_file;

    wp_enqueue_script(
        'wptv-app',
        WPTV_PLUGIN_URL . 'build/index.js',
        $asset['dependencies'],
        $asset['version'],
        true
    );

    if ( file_exists( WPTV_PLUGIN_DIR . 'build/style-index.css' ) ) {
        wp_enqueue_style(
            'wptv-app',
            WPTV_PLUGIN_URL . 'build/style-index.css',
            [],
            $asset['version']
        );
    }

    wp_localize_script(
        'wptv-app',
        'wptvConfig',
        [
            'nonce'       => wp_create_nonce( 'wp_rest' ),
            'restUrl'     => rest_url(),
            'adminUrl'    => admin_url(),
            'canEditAll'  => current_user_can( 'edit_others_pages' ),
            'exportNonce' => wp_create_nonce( 'wptv_export_subtree' ),
        ]
    );
}
add_action( 'admin_enqueue_scripts', 'wptv_enqueue_assets' );

/**
 * Register custom REST API routes.
 */
function wptv_register_routes(): void {
    register_rest_route(
        'wptv/v1',
        '/duplicate-subtree',
        [
            'methods'             => WP_REST_Server::CREATABLE,
            'callback'            => 'wptv_duplicate_subtree_handler',
            'permission_callback' => function () {
                return current_user_can( 'edit_others_pages' );
            },
            'args'                => [
                'id' => [
                    'required'          => true,
                    'type'              => 'integer',
                    'sanitize_callback' => 'absint',
                ],
            ],
        ]
    );

    register_rest_route(
        'wptv/v1',
        '/bulk-status',
        [
            'methods'             => WP_REST_Server::CREATABLE,
            'callback'            => 'wptv_bulk_status_handler',
            'permission_callback' => function () {
                return current_user_can( 'edit_others_pages' );
            },
            'args'                => [
                'id'     => [
                    'required'          => true,
                    'type'              => 'integer',
                    'sanitize_callback' => 'absint',
                ],
                'status' => [
                    'required'          => true,
                    'type'              => 'string',
                    'sanitize_callback' => 'sanitize_key',
                    'enum'              => [ 'publish', 'draft', 'private', 'pending', 'trash' ],
                ],
            ],
        ]
    );
}
add_action( 'rest_api_init', 'wptv_register_routes' );

/**
 * Handle WXR subtree export via admin-post.php (not REST, so we can stream raw XML).
 */
add_action( 'admin_post_wptv_export_subtree', 'wptv_export_subtree_handler' );

/**
 * Collect all posts in a subtree using BFS (avoids deep recursion on large trees).
 * Returns posts in BFS order: root first, then level by level.
 *
 * @param WP_Post $root
 * @return WP_Post[]
 */
function wptv_collect_subtree_posts( WP_Post $root ): array {
    $result = [ $root ];
    $queue  = [ $root->ID ];

    while ( ! empty( $queue ) ) {
        $parent_id = array_shift( $queue );
        $children  = get_posts( [
            'post_parent'    => $parent_id,
            'post_type'      => 'any',
            'post_status'    => 'any',
            'posts_per_page' => -1,
            'orderby'        => 'menu_order',
            'order'          => 'ASC',
        ] );
        foreach ( $children as $child ) {
            $result[] = $child;
            $queue[]  = $child->ID;
        }
    }

    return $result;
}

/**
 * Collect all descendant IDs for a given parent using BFS.
 *
 * @param int $parent_id
 * @return int[]
 */
function wptv_get_descendant_ids( int $parent_id ): array {
    $ids   = [];
    $queue = [ $parent_id ];

    while ( ! empty( $queue ) ) {
        $current  = array_shift( $queue );
        $children = get_posts( [
            'post_parent'    => $current,
            'post_type'      => 'any',
            'post_status'    => 'any',
            'posts_per_page' => -1,
            'fields'         => 'ids',
        ] );
        foreach ( $children as $child_id ) {
            $ids[]   = (int) $child_id;
            $queue[] = (int) $child_id;
        }
    }

    return $ids;
}

/**
 * Fetch all public (non-underscore-prefixed) meta for a set of post IDs in one query.
 * Returns [ post_id => [ [meta_key, meta_value], ... ] ].
 *
 * @param int[] $post_ids
 * @return array<int, array<int, array{string, string}>>
 */
function wptv_fetch_public_meta( array $post_ids ): array {
    global $wpdb;

    if ( empty( $post_ids ) ) {
        return [];
    }

    $placeholders = implode( ',', array_fill( 0, count( $post_ids ), '%d' ) );
    $rows         = $wpdb->get_results(
        $wpdb->prepare(
            // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
            "SELECT post_id, meta_key, meta_value FROM {$wpdb->postmeta}
              WHERE post_id IN ($placeholders) AND meta_key NOT LIKE '\\_%%'",
            ...$post_ids
        )
    );

    $meta = [];
    foreach ( $rows as $row ) {
        $meta[ (int) $row->post_id ][] = [ $row->meta_key, $row->meta_value ];
    }

    return $meta;
}

/**
 * Insert all meta pairs for a post in a single query.
 *
 * @param int                       $post_id
 * @param array<int, array{string, string}> $pairs
 */
function wptv_batch_insert_meta( int $post_id, array $pairs ): void {
    global $wpdb;

    if ( empty( $pairs ) ) {
        return;
    }

    $values = [];
    foreach ( $pairs as [ $key, $value ] ) {
        $values[] = $wpdb->prepare( '(%d, %s, %s)', $post_id, $key, $value );
    }

    // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
    $wpdb->query(
        "INSERT INTO {$wpdb->postmeta} (post_id, meta_key, meta_value) VALUES "
        . implode( ',', $values )
    );
}

/**
 * Insert a draft copy of a post without copying meta (meta is handled separately).
 *
 * @param WP_Post $original
 * @param int     $new_parent
 * @param int     $menu_order
 * @return WP_Post|WP_Error
 */
function wptv_insert_post_copy( WP_Post $original, int $new_parent, int $menu_order ): WP_Post|WP_Error {
    $new_id = wp_insert_post(
        [
            'post_title'   => 'Copy of ' . $original->post_title,
            'post_content' => $original->post_content,
            'post_excerpt' => $original->post_excerpt,
            'post_status'  => 'draft',
            'post_type'    => $original->post_type,
            'post_parent'  => $new_parent,
            'menu_order'   => $menu_order,
        ],
        true
    );

    if ( is_wp_error( $new_id ) ) {
        return $new_id;
    }

    return get_post( $new_id );
}

/**
 * Format a WP_Post object as a minimal array matching the frontend WPPost shape.
 *
 * @param WP_Post $post
 * @return array<string, mixed>
 */
function wptv_format_post( WP_Post $post ): array {
    return [
        'id'         => $post->ID,
        'parent'     => $post->post_parent,
        'menu_order' => $post->menu_order,
        'title'      => [ 'rendered' => $post->post_title ],
        'status'     => $post->post_status,
        'type'       => $post->post_type,
        'link'       => get_permalink( $post->ID ) ?: '',
        'slug'       => $post->post_name,
    ];
}

/**
 * Handle bulk status update for a post and all its descendants.
 *
 * Strategies used to minimise DB round-trips:
 *  - 1 SELECT  to read current statuses (needed to save trash-restore meta).
 *  - 1 INSERT  to write all trash meta rows at once (trash path only).
 *  - 1 UPDATE  to flip all post statuses in a single statement.
 *
 * @param WP_REST_Request $request
 * @return WP_REST_Response|WP_Error
 */
function wptv_bulk_status_handler( WP_REST_Request $request ): WP_REST_Response|WP_Error {
    global $wpdb;

    $id     = (int) $request->get_param( 'id' );
    $status = $request->get_param( 'status' );
    $ids    = array_merge( [ $id ], wptv_get_descendant_ids( $id ) );

    $placeholders = implode( ',', array_fill( 0, count( $ids ), '%d' ) );

    if ( 'trash' === $status ) {
        // Fetch current statuses so we can save them as restore-meta.
        $rows = $wpdb->get_results(
            $wpdb->prepare(
                // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                "SELECT ID, post_status FROM {$wpdb->posts}
                  WHERE ID IN ($placeholders) AND post_status != 'trash'",
                ...$ids
            )
        );

        if ( ! empty( $rows ) ) {
            $time        = time();
            $meta_values = [];
            foreach ( $rows as $row ) {
                $meta_values[] = $wpdb->prepare( '(%d, %s, %s)', $row->ID, '_wp_trash_meta_status', $row->post_status );
                $meta_values[] = $wpdb->prepare( '(%d, %s, %s)', $row->ID, '_wp_trash_meta_time', $time );
            }
            // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
            $wpdb->query(
                "INSERT INTO {$wpdb->postmeta} (post_id, meta_key, meta_value) VALUES "
                . implode( ',', $meta_values )
                . ' ON DUPLICATE KEY UPDATE meta_value = VALUES(meta_value)'
            );
        }
    }

    // Single UPDATE for all posts.
    $wpdb->query(
        $wpdb->prepare(
            // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
            "UPDATE {$wpdb->posts} SET post_status = %s WHERE ID IN ($placeholders)",
            array_merge( [ $status ], $ids )
        )
    );

    // Clear the object cache for every affected post.
    foreach ( $ids as $post_id ) {
        clean_post_cache( $post_id );
    }

    return new WP_REST_Response( [ 'updated' => $ids ], 200 );
}

/**
 * Handle subtree duplication: duplicate a post and all its descendants.
 *
 * Strategies used to minimise DB round-trips:
 *  - BFS traversal instead of recursion (avoids stack overflow on deep trees).
 *  - 1 SELECT  to pre-fetch all public meta for the entire source subtree.
 *  - 1 INSERT  per new post to write all its meta rows at once.
 *
 * @param WP_REST_Request $request
 * @return WP_REST_Response|WP_Error
 */
function wptv_duplicate_subtree_handler( WP_REST_Request $request ): WP_REST_Response|WP_Error {
    $id       = (int) $request->get_param( 'id' );
    $original = get_post( $id );

    if ( ! $original ) {
        return new WP_Error( 'wptv_not_found', 'Post not found.', [ 'status' => 404 ] );
    }

    // Collect the full source subtree in BFS order (parent always before its children).
    $source_posts = wptv_collect_subtree_posts( $original );

    // Pre-fetch all public meta for the entire subtree in one query.
    $source_ids = array_column( $source_posts, 'ID' );
    $bulk_meta  = wptv_fetch_public_meta( $source_ids );

    // Duplicate the root, placing it right after the original.
    $new_root = wptv_insert_post_copy( $original, $original->post_parent, $original->menu_order + 1 );
    if ( is_wp_error( $new_root ) ) {
        return $new_root;
    }
    wptv_batch_insert_meta( $new_root->ID, $bulk_meta[ $original->ID ] ?? [] );

    $created = [ $new_root ];
    // Map original ID → new ID so children can reference their new parent.
    $id_map = [ $original->ID => $new_root->ID ];

    // Process the remaining posts in BFS order; parent is always already in $id_map.
    foreach ( array_slice( $source_posts, 1 ) as $src ) {
        $new_parent = $id_map[ $src->post_parent ] ?? $src->post_parent;
        $new_post   = wptv_insert_post_copy( $src, $new_parent, $src->menu_order );
        if ( is_wp_error( $new_post ) ) {
            return $new_post;
        }
        wptv_batch_insert_meta( $new_post->ID, $bulk_meta[ $src->ID ] ?? [] );

        $created[]            = $new_post;
        $id_map[ $src->ID ] = $new_post->ID;
    }

    return new WP_REST_Response(
        [
            'root_id' => $new_root->ID,
            'posts'   => array_map( 'wptv_format_post', $created ),
        ],
        201
    );
}

/**
 * Wrap a string in a CDATA section, escaping nested CDATA terminators.
 * Mirrors the wxr_cdata() helper defined inside WordPress's export_wp().
 *
 * @param string|null $str
 * @return string
 */
function wptv_wxr_cdata( ?string $str ): string {
    $str = (string) $str;
    if ( ! wp_is_valid_utf8( $str ) ) {
        $str = mb_convert_encoding( $str, 'UTF-8', 'UTF-8' );
    }
    return '<![CDATA[' . str_replace( ']]>', ']]]]><![CDATA[>', $str ) . ']]>';
}

/**
 * Handle WXR export for a post and all its descendants.
 *
 * Generates a WordPress eXtended RSS (WXR 1.2) file matching the structure
 * produced by the built-in export_wp() — including comments, taxonomies,
 * attachments, and post meta — but scoped to a single subtree.
 *
 * We cannot reuse export_wp() directly because it does not support filtering
 * by an arbitrary set of post IDs; it only accepts post-type / author /
 * category / date-range / status filters with no hook to inject custom IDs.
 *
 */
function wptv_export_subtree_handler(): void {
    global $wpdb;

    if ( ! current_user_can( 'edit_others_pages' ) ) {
        wp_die( 'Unauthorized', 403 );
    }

    check_admin_referer( 'wptv_export_subtree' );

    $id   = isset( $_GET['id'] ) ? absint( $_GET['id'] ) : 0;
    $root = $id ? get_post( $id ) : null;

    if ( ! $root ) {
        wp_die( 'Post not found', 404 );
    }

    $posts    = wptv_collect_subtree_posts( $root );
    $post_ids = array_column( $posts, 'ID' );

    // --- Authors -------------------------------------------------------
    $author_ids = array_unique( array_column( $posts, 'post_author' ) );
    $authors    = array_filter( array_map( 'get_userdata', $author_ids ) );

    // --- Stream XML directly -------------------------------------------
    $wxr_version = '1.2';
    $charset     = get_option( 'blog_charset' );
    $slug        = sanitize_file_name( $root->post_name ?: 'export' );

    header( 'Content-Description: File Transfer' );
    header( 'Content-Disposition: attachment; filename=' . $slug . '-subtree.xml' );
    header( 'Content-Type: text/xml; charset=' . $charset, true );

    echo '<?xml version="1.0" encoding="' . esc_attr( $charset ) . "\" ?>\n";
    ?>
<rss version="2.0"
  xmlns:excerpt="http://wordpress.org/export/<?php echo $wxr_version; ?>/excerpt/"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:wfw="http://wellformedweb.org/CommentAPI/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:wp="http://wordpress.org/export/<?php echo $wxr_version; ?>/"
>
<channel>
  <title><?php echo wptv_wxr_cdata( get_bloginfo_rss( 'name' ) ); ?></title>
  <link><?php bloginfo_rss( 'url' ); ?></link>
  <description><?php bloginfo_rss( 'description' ); ?></description>
  <pubDate><?php echo gmdate( 'D, d M Y H:i:s +0000' ); ?></pubDate>
  <language><?php bloginfo_rss( 'language' ); ?></language>
  <wp:wxr_version><?php echo $wxr_version; ?></wp:wxr_version>
  <wp:base_site_url><?php echo esc_url( is_multisite() ? network_home_url() : get_bloginfo_rss( 'url' ) ); ?></wp:base_site_url>
  <wp:base_blog_url><?php bloginfo_rss( 'url' ); ?></wp:base_blog_url>
<?php foreach ( $authors as $author ) : ?>
  <wp:author>
    <wp:author_id><?php echo (int) $author->ID; ?></wp:author_id>
    <wp:author_login><?php echo wptv_wxr_cdata( $author->user_login ); ?></wp:author_login>
    <wp:author_email><?php echo wptv_wxr_cdata( $author->user_email ); ?></wp:author_email>
    <wp:author_display_name><?php echo wptv_wxr_cdata( $author->display_name ); ?></wp:author_display_name>
    <wp:author_first_name><?php echo wptv_wxr_cdata( $author->first_name ); ?></wp:author_first_name>
    <wp:author_last_name><?php echo wptv_wxr_cdata( $author->last_name ); ?></wp:author_last_name>
  </wp:author>
<?php endforeach; ?>
<?php
    // Process posts in chunks to keep memory usage reasonable.
    while ( $chunk = array_splice( $post_ids, 0, 20 ) ) {
        $in    = implode( ',', array_map( 'intval', $chunk ) );
        $rows  = $wpdb->get_results( "SELECT * FROM {$wpdb->posts} WHERE ID IN ($in)" );

        foreach ( $rows as $post ) {
            setup_postdata( $post );
            $is_sticky = is_sticky( $post->ID ) ? 1 : 0;
            ?>
  <item>
    <title><?php echo wptv_wxr_cdata( $post->post_title ); ?></title>
    <link><?php echo esc_url( get_permalink( $post->ID ) ); ?></link>
    <pubDate><?php echo mysql2date( 'D, d M Y H:i:s +0000', get_post_time( 'Y-m-d H:i:s', true, $post ), false ); ?></pubDate>
    <dc:creator><?php echo wptv_wxr_cdata( get_the_author_meta( 'login', $post->post_author ) ); ?></dc:creator>
    <guid isPermaLink="false"><?php the_guid( $post ); ?></guid>
    <description></description>
    <content:encoded><?php echo wptv_wxr_cdata( $post->post_content ); ?></content:encoded>
    <excerpt:encoded><?php echo wptv_wxr_cdata( $post->post_excerpt ); ?></excerpt:encoded>
    <wp:post_id><?php echo (int) $post->ID; ?></wp:post_id>
    <wp:post_date><?php echo wptv_wxr_cdata( $post->post_date ); ?></wp:post_date>
    <wp:post_date_gmt><?php echo wptv_wxr_cdata( $post->post_date_gmt ); ?></wp:post_date_gmt>
    <wp:post_modified><?php echo wptv_wxr_cdata( $post->post_modified ); ?></wp:post_modified>
    <wp:post_modified_gmt><?php echo wptv_wxr_cdata( $post->post_modified_gmt ); ?></wp:post_modified_gmt>
    <wp:comment_status><?php echo wptv_wxr_cdata( $post->comment_status ); ?></wp:comment_status>
    <wp:ping_status><?php echo wptv_wxr_cdata( $post->ping_status ); ?></wp:ping_status>
    <wp:post_name><?php echo wptv_wxr_cdata( $post->post_name ); ?></wp:post_name>
    <wp:status><?php echo wptv_wxr_cdata( $post->post_status ); ?></wp:status>
    <wp:post_parent><?php echo (int) $post->post_parent; ?></wp:post_parent>
    <wp:menu_order><?php echo (int) $post->menu_order; ?></wp:menu_order>
    <wp:post_type><?php echo wptv_wxr_cdata( $post->post_type ); ?></wp:post_type>
    <wp:post_password><?php echo wptv_wxr_cdata( $post->post_password ); ?></wp:post_password>
    <wp:is_sticky><?php echo (int) $is_sticky; ?></wp:is_sticky>
<?php if ( 'attachment' === $post->post_type ) : ?>
    <wp:attachment_url><?php echo wptv_wxr_cdata( wp_get_attachment_url( $post->ID ) ); ?></wp:attachment_url>
<?php endif; ?>
<?php
            // Taxonomies.
            $taxonomies = get_object_taxonomies( $post->post_type );
            if ( ! empty( $taxonomies ) ) {
                $terms = wp_get_object_terms( $post->ID, $taxonomies );
                foreach ( (array) $terms as $term ) {
                    echo '    <category domain="' . esc_attr( $term->taxonomy ) . '" nicename="' . esc_attr( $term->slug ) . '">' . wptv_wxr_cdata( $term->name ) . "</category>\n";
                }
            }

            // Post meta.
            $postmeta = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM $wpdb->postmeta WHERE post_id = %d", $post->ID ) );
            foreach ( $postmeta as $meta ) {
                if ( '_edit_lock' === $meta->meta_key ) {
                    continue;
                }
                ?>
    <wp:postmeta>
      <wp:meta_key><?php echo wptv_wxr_cdata( $meta->meta_key ); ?></wp:meta_key>
      <wp:meta_value><?php echo wptv_wxr_cdata( $meta->meta_value ); ?></wp:meta_value>
    </wp:postmeta>
<?php
            }

            // Comments.
            $comments = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM $wpdb->comments WHERE comment_post_ID = %d AND comment_approved <> 'spam'", $post->ID ) );
            foreach ( array_map( 'get_comment', $comments ) as $c ) {
                ?>
    <wp:comment>
      <wp:comment_id><?php echo (int) $c->comment_ID; ?></wp:comment_id>
      <wp:comment_author><?php echo wptv_wxr_cdata( $c->comment_author ); ?></wp:comment_author>
      <wp:comment_author_email><?php echo wptv_wxr_cdata( $c->comment_author_email ); ?></wp:comment_author_email>
      <wp:comment_author_url><?php echo esc_url( $c->comment_author_url ); ?></wp:comment_author_url>
      <wp:comment_author_IP><?php echo wptv_wxr_cdata( $c->comment_author_IP ); ?></wp:comment_author_IP>
      <wp:comment_date><?php echo wptv_wxr_cdata( $c->comment_date ); ?></wp:comment_date>
      <wp:comment_date_gmt><?php echo wptv_wxr_cdata( $c->comment_date_gmt ); ?></wp:comment_date_gmt>
      <wp:comment_content><?php echo wptv_wxr_cdata( $c->comment_content ); ?></wp:comment_content>
      <wp:comment_approved><?php echo wptv_wxr_cdata( $c->comment_approved ); ?></wp:comment_approved>
      <wp:comment_type><?php echo wptv_wxr_cdata( $c->comment_type ); ?></wp:comment_type>
      <wp:comment_parent><?php echo (int) $c->comment_parent; ?></wp:comment_parent>
      <wp:comment_user_id><?php echo (int) $c->user_id; ?></wp:comment_user_id>
<?php
                $c_meta = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM $wpdb->commentmeta WHERE comment_id = %d", $c->comment_ID ) );
                foreach ( $c_meta as $meta ) {
                    ?>
      <wp:commentmeta>
        <wp:meta_key><?php echo wptv_wxr_cdata( $meta->meta_key ); ?></wp:meta_key>
        <wp:meta_value><?php echo wptv_wxr_cdata( $meta->meta_value ); ?></wp:meta_value>
      </wp:commentmeta>
<?php           } ?>
    </wp:comment>
<?php       } ?>
  </item>
<?php
        }
    }
    wp_reset_postdata();
    ?>
</channel>
</rss>
<?php
    exit;
}
