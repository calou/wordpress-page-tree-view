<?php
/**
 * Plugin Name: WPTV Test Data Seeder
 * Description: Admin page to delete WXR-imported test data. Loaded as mu-plugin by blueprint.json.
 * Version:     3.0.0
 */

if ( ! defined( 'ABSPATH' ) ) { exit; }

add_action( 'admin_menu', function () {
    add_management_page(
        'Seed Tree View Data', 'Seed Tree View Data',
        'manage_options', 'wptv-seeder', 'wptv_seeder_page'
    );
} );

function wptv_seeder_page(): void {
    if ( ! current_user_can( 'manage_options' ) ) { return; }

    $message = '';

    if (
        isset( $_POST['wptv_seed_nonce'] ) &&
        wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['wptv_seed_nonce'] ) ), 'wptv_seed' )
    ) {
        $deleted = wptv_delete_seed_data();
        $message = sprintf(
            '<div class="notice notice-warning"><p>Deleted <strong>%d pages</strong>.</p></div>',
            $deleted
        );
    }

    $count = wptv_seeded_count();
    ?>
    <div class="wrap">
        <h1>Tree View — Test Data</h1>
        <?php echo $message; // phpcs:ignore WordPress.Security.EscapeOutput ?>
        <p>
            The WXR file (<code>bin/test-data.wxr</code>) was imported via <code>blueprint.json</code>
            and created <strong><?php echo esc_html( number_format( $count ) ); ?> pages</strong>
            across 9 levels.
            <a href="<?php echo esc_url( admin_url( 'admin.php?page=wordpress-wasm-tree-view' ) ); ?>">Open Tree View →</a>
        </p>
        <?php if ( $count > 0 ) : ?>
        <form method="post">
            <?php wp_nonce_field( 'wptv_seed', 'wptv_seed_nonce' ); ?>
            <?php submit_button( 'Delete All Test Pages', 'secondary' ); ?>
        </form>
        <?php endif; ?>
    </div>
    <?php
}

function wptv_seeded_count(): int {
    global $wpdb;
    return (int) $wpdb->get_var(
        "SELECT COUNT(*) FROM {$wpdb->posts}
         WHERE post_type = 'page' AND post_name LIKE 'wptv-%'"
    );
}

function wptv_delete_seed_data(): int {
    global $wpdb;
    $deleted = 0;
    do {
        $ids = $wpdb->get_col(
            "SELECT ID FROM {$wpdb->posts}
             WHERE post_type = 'page' AND post_name LIKE 'wptv-%'
             LIMIT 500"
        );
        if ( empty( $ids ) ) { break; }
        $ph = implode( ',', array_fill( 0, count( $ids ), '%d' ) );
        // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
        $wpdb->query( $wpdb->prepare( "DELETE FROM {$wpdb->postmeta} WHERE post_id IN ({$ph})", $ids ) );
        // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
        $deleted += (int) $wpdb->query( $wpdb->prepare( "DELETE FROM {$wpdb->posts} WHERE ID IN ({$ph})", $ids ) );
    } while ( count( $ids ) === 500 );
    return $deleted;
}
