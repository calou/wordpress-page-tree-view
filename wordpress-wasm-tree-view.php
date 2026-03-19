<?php
/**
 * Plugin Name:       WordPress WASM Tree View
 * Plugin URI:        https://github.com/example/wordpress-wasm-tree-view
 * Description:       Hierarchical tree view for WordPress pages, posts, and custom post types with drag-and-drop support.
 * Version:           1.0.0
 * Requires at least: 6.0
 * Requires PHP:      8.0
 * Author:            WordPress Tree View
 * License:           GPL-2.0-or-later
 * Text Domain:       wordpress-wasm-tree-view
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
        __( 'Tree View', 'wordpress-wasm-tree-view' ),
        __( 'Tree View', 'wordpress-wasm-tree-view' ),
        'edit_pages',
        'wordpress-wasm-tree-view',
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
    if ( 'toplevel_page_wordpress-wasm-tree-view' !== $hook_suffix ) {
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
        ]
    );
}
add_action( 'admin_enqueue_scripts', 'wptv_enqueue_assets' );
