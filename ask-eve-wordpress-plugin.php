<?php
/**
 * Plugin Name: Ask Eve Assist
 * Plugin URI: https://eveappeal.org.uk
 * Description: AI-powered gynaecological health support widget powered by Microsoft 365 Agents SDK. Provides crisis detection, health information, and nurse escalation services.
 * Version: 1.0.0
 * Author: The Eve Appeal
 * Author URI: https://eveappeal.org.uk
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: ask-eve-assist
 * Domain Path: /languages
 * 
 * Requires at least: 5.0
 * Tested up to: 6.4
 * Requires PHP: 7.4
 * Network: false
 * 
 * @package AskEveAssist
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

// Define plugin constants
define('ASK_EVE_VERSION', '1.0.0');
define('ASK_EVE_PLUGIN_URL', plugin_dir_url(__FILE__));
define('ASK_EVE_PLUGIN_PATH', plugin_dir_path(__FILE__));

/**
 * Ask Eve Assist Plugin Main Class
 */
class AskEveAssist {
    
    public function __construct() {
        add_action('init', array($this, 'init'));
        register_activation_hook(__FILE__, array($this, 'activate'));
        register_deactivation_hook(__FILE__, array($this, 'deactivate'));
    }
    
    /**
     * Initialize the plugin
     */
    public function init() {
        // Load text domain for internationalization
        load_plugin_textdomain('ask-eve-assist', false, dirname(plugin_basename(__FILE__)) . '/languages');
        
        // Add admin menu
        add_action('admin_menu', array($this, 'admin_menu'));
        
        // Add widget to frontend
        add_action('wp_footer', array($this, 'add_widget'));
        
        // Register settings
        add_action('admin_init', array($this, 'register_settings'));
        
        // Add shortcode support
        add_shortcode('ask_eve_assist', array($this, 'shortcode'));
        
        // Add admin styles and scripts
        add_action('admin_enqueue_scripts', array($this, 'admin_scripts'));
    }
    
    /**
     * Plugin activation
     */
    public function activate() {
        // Set default options
        $default_options = array(
            'enabled' => true,
            'api_url' => 'https://api.eveappeal.org.uk/chat',
            'brand_color' => '#d63384',
            'position' => 'bottom-right',
            'welcome_message' => 'Hello! I\'m Ask Eve Assist. How can I help you with gynaecological health information today?',
            'crisis_phone' => '0808 802 0019',
            'nurse_line' => '0808 802 0019',
            'show_on_pages' => array('all'),
            'exclude_pages' => array(),
            'title' => 'Ask Eve Assist',
            'subtitle' => 'AI-Powered Health Support'
        );
        
        add_option('ask_eve_options', $default_options);
    }
    
    /**
     * Plugin deactivation
     */
    public function deactivate() {
        // Clean up if needed
    }
    
    /**
     * Add admin menu
     */
    public function admin_menu() {
        add_options_page(
            __('Ask Eve Assist Settings', 'ask-eve-assist'),
            __('Ask Eve Assist', 'ask-eve-assist'),
            'manage_options',
            'ask-eve-assist',
            array($this, 'admin_page')
        );
    }
    
    /**
     * Register settings
     */
    public function register_settings() {
        register_setting('ask_eve_options_group', 'ask_eve_options', array($this, 'sanitize_options'));
    }
    
    /**
     * Sanitize options
     */
    public function sanitize_options($input) {
        $sanitized = array();
        
        $sanitized['enabled'] = isset($input['enabled']) ? true : false;
        $sanitized['api_url'] = esc_url_raw($input['api_url']);
        $sanitized['brand_color'] = sanitize_hex_color($input['brand_color']);
        $sanitized['position'] = sanitize_text_field($input['position']);
        $sanitized['welcome_message'] = sanitize_textarea_field($input['welcome_message']);
        $sanitized['crisis_phone'] = sanitize_text_field($input['crisis_phone']);
        $sanitized['nurse_line'] = sanitize_text_field($input['nurse_line']);
        $sanitized['title'] = sanitize_text_field($input['title']);
        $sanitized['subtitle'] = sanitize_text_field($input['subtitle']);
        $sanitized['show_on_pages'] = isset($input['show_on_pages']) ? array_map('sanitize_text_field', $input['show_on_pages']) : array();
        $sanitized['exclude_pages'] = isset($input['exclude_pages']) ? array_map('intval', $input['exclude_pages']) : array();
        
        return $sanitized;
    }
    
    /**
     * Admin page HTML
     */
    public function admin_page() {
        $options = get_option('ask_eve_options');
        ?>
        <div class="wrap">
            <h1><?php _e('Ask Eve Assist Settings', 'ask-eve-assist'); ?></h1>
            
            <div class="notice notice-info">
                <p>
                    <strong><?php _e('Ask Eve Assist', 'ask-eve-assist'); ?></strong> - 
                    <?php _e('AI-powered gynaecological health support using Microsoft 365 Agents SDK technology.', 'ask-eve-assist'); ?>
                </p>
            </div>
            
            <form method="post" action="options.php">
                <?php settings_fields('ask_eve_options_group'); ?>
                
                <table class="form-table">
                    <tr>
                        <th scope="row"><?php _e('Enable Widget', 'ask-eve-assist'); ?></th>
                        <td>
                            <label>
                                <input type="checkbox" name="ask_eve_options[enabled]" value="1" <?php checked($options['enabled'], true); ?> />
                                <?php _e('Enable Ask Eve Assist chat widget', 'ask-eve-assist'); ?>
                            </label>
                        </td>
                    </tr>
                    
                    <tr>
                        <th scope="row"><?php _e('API URL', 'ask-eve-assist'); ?></th>
                        <td>
                            <input type="url" name="ask_eve_options[api_url]" value="<?php echo esc_attr($options['api_url']); ?>" class="regular-text" />
                            <p class="description"><?php _e('The API endpoint for the Ask Eve Assist service.', 'ask-eve-assist'); ?></p>
                        </td>
                    </tr>
                    
                    <tr>
                        <th scope="row"><?php _e('Brand Color', 'ask-eve-assist'); ?></th>
                        <td>
                            <input type="text" name="ask_eve_options[brand_color]" value="<?php echo esc_attr($options['brand_color']); ?>" class="color-picker" />
                            <p class="description"><?php _e('Primary color for the chat widget (The Eve Appeal pink: #d63384).', 'ask-eve-assist'); ?></p>
                        </td>
                    </tr>
                    
                    <tr>
                        <th scope="row"><?php _e('Position', 'ask-eve-assist'); ?></th>
                        <td>
                            <select name="ask_eve_options[position]">
                                <option value="bottom-right" <?php selected($options['position'], 'bottom-right'); ?>><?php _e('Bottom Right', 'ask-eve-assist'); ?></option>
                                <option value="bottom-left" <?php selected($options['position'], 'bottom-left'); ?>><?php _e('Bottom Left', 'ask-eve-assist'); ?></option>
                            </select>
                        </td>
                    </tr>
                    
                    <tr>
                        <th scope="row"><?php _e('Widget Title', 'ask-eve-assist'); ?></th>
                        <td>
                            <input type="text" name="ask_eve_options[title]" value="<?php echo esc_attr($options['title']); ?>" class="regular-text" />
                        </td>
                    </tr>
                    
                    <tr>
                        <th scope="row"><?php _e('Widget Subtitle', 'ask-eve-assist'); ?></th>
                        <td>
                            <input type="text" name="ask_eve_options[subtitle]" value="<?php echo esc_attr($options['subtitle']); ?>" class="regular-text" />
                        </td>
                    </tr>
                    
                    <tr>
                        <th scope="row"><?php _e('Welcome Message', 'ask-eve-assist'); ?></th>
                        <td>
                            <textarea name="ask_eve_options[welcome_message]" rows="3" class="large-text"><?php echo esc_textarea($options['welcome_message']); ?></textarea>
                            <p class="description"><?php _e('The first message users see when they open the chat.', 'ask-eve-assist'); ?></p>
                        </td>
                    </tr>
                    
                    <tr>
                        <th scope="row"><?php _e('Crisis Phone Number', 'ask-eve-assist'); ?></th>
                        <td>
                            <input type="text" name="ask_eve_options[crisis_phone]" value="<?php echo esc_attr($options['crisis_phone']); ?>" class="regular-text" />
                            <p class="description"><?php _e('Phone number displayed for crisis situations.', 'ask-eve-assist'); ?></p>
                        </td>
                    </tr>
                    
                    <tr>
                        <th scope="row"><?php _e('Nurse Line Number', 'ask-eve-assist'); ?></th>
                        <td>
                            <input type="text" name="ask_eve_options[nurse_line]" value="<?php echo esc_attr($options['nurse_line']); ?>" class="regular-text" />
                            <p class="description"><?php _e('Phone number for nurse consultation services.', 'ask-eve-assist'); ?></p>
                        </td>
                    </tr>
                </table>
                
                <h2><?php _e('Advanced Settings', 'ask-eve-assist'); ?></h2>
                
                <table class="form-table">
                    <tr>
                        <th scope="row"><?php _e('Show Widget On', 'ask-eve-assist'); ?></th>
                        <td>
                            <fieldset>
                                <label>
                                    <input type="radio" name="ask_eve_options[show_on_pages][]" value="all" <?php echo in_array('all', $options['show_on_pages']) ? 'checked' : ''; ?> />
                                    <?php _e('All pages', 'ask-eve-assist'); ?>
                                </label><br>
                                <label>
                                    <input type="radio" name="ask_eve_options[show_on_pages][]" value="home" <?php echo in_array('home', $options['show_on_pages']) ? 'checked' : ''; ?> />
                                    <?php _e('Home page only', 'ask-eve-assist'); ?>
                                </label><br>
                                <label>
                                    <input type="radio" name="ask_eve_options[show_on_pages][]" value="specific" <?php echo in_array('specific', $options['show_on_pages']) ? 'checked' : ''; ?> />
                                    <?php _e('Specific pages (use shortcode)', 'ask-eve-assist'); ?>
                                </label>
                            </fieldset>
                        </td>
                    </tr>
                </table>
                
                <?php submit_button(); ?>
            </form>
            
            <div class="card">
                <h2><?php _e('Usage Instructions', 'ask-eve-assist'); ?></h2>
                <h3><?php _e('Automatic Display', 'ask-eve-assist'); ?></h3>
                <p><?php _e('The chat widget will automatically appear based on your settings above.', 'ask-eve-assist'); ?></p>
                
                <h3><?php _e('Manual Placement with Shortcode', 'ask-eve-assist'); ?></h3>
                <p><?php _e('Use this shortcode to manually place the chat widget:', 'ask-eve-assist'); ?></p>
                <code>[ask_eve_assist]</code>
                
                <h3><?php _e('Custom Button', 'ask-eve-assist'); ?></h3>
                <p><?php _e('Create a custom button that opens the chat:', 'ask-eve-assist'); ?></p>
                <code>&lt;button onclick="askEve.open()"&gt;Chat with Ask Eve&lt;/button&gt;</code>
                
                <h3><?php _e('Healthcare Features', 'ask-eve-assist'); ?></h3>
                <ul>
                    <li><?php _e('🤖 Multi-Agent Architecture: Safety → Content → Escalation', 'ask-eve-assist'); ?></li>
                    <li><?php _e('🚨 Crisis Detection: <500ms response with emergency contacts', 'ask-eve-assist'); ?></li>
                    <li><?php _e('🏥 MHRA Compliant: Information only, no medical advice', 'ask-eve-assist'); ?></li>
                    <li><?php _e('📞 Nurse Escalation: GDPR-compliant callback coordination', 'ask-eve-assist'); ?></li>
                    <li><?php _e('📱 Mobile Responsive: Works on all devices', 'ask-eve-assist'); ?></li>
                    <li><?php _e('♿ Accessible: Screen reader compatible', 'ask-eve-assist'); ?></li>
                </ul>
            </div>
        </div>
        
        <style>
            .card {
                background: #fff;
                border: 1px solid #ccd0d4;
                border-left: 4px solid #d63384;
                box-shadow: 0 1px 1px rgba(0,0,0,.04);
                margin-top: 20px;
                padding: 20px;
            }
            .card h2 {
                margin-top: 0;
                color: #d63384;
            }
            .card code {
                background: #f1f1f1;
                padding: 4px 8px;
                border-radius: 3px;
                font-family: Monaco, 'Courier New', monospace;
            }
            .color-picker {
                max-width: 100px;
            }
        </style>
        <?php
    }
    
    /**
     * Add widget to frontend
     */
    public function add_widget() {
        $options = get_option('ask_eve_options');
        
        if (!$options['enabled']) {
            return;
        }
        
        // Check if widget should be shown on current page
        if (!$this->should_show_widget()) {
            return;
        }
        
        $this->render_widget($options);
    }
    
    /**
     * Check if widget should be shown on current page
     */
    private function should_show_widget() {
        $options = get_option('ask_eve_options');
        $show_on = $options['show_on_pages'];
        
        if (in_array('all', $show_on)) {
            return true;
        }
        
        if (in_array('home', $show_on) && is_home()) {
            return true;
        }
        
        if (in_array('specific', $show_on)) {
            return false; // Only show via shortcode
        }
        
        return false;
    }
    
    /**
     * Render the widget
     */
    private function render_widget($options) {
        ?>
        <script>
            // Ask Eve Assist Widget Configuration
            window.askEveConfig = <?php echo json_encode($options, JSON_UNESCAPED_SLASHES); ?>;
        </script>
        <script>
            (function() {
                const config = window.askEveConfig;
                
                // Load the widget script dynamically
                const script = document.createElement('script');
                script.src = '<?php echo ASK_EVE_PLUGIN_URL; ?>assets/ask-eve-widget.min.js';
                script.onload = function() {
                    console.log('Ask Eve Assist widget loaded');
                };
                document.head.appendChild(script);
            })();
        </script>
        <?php
    }
    
    /**
     * Shortcode handler
     */
    public function shortcode($atts) {
        $options = get_option('ask_eve_options');
        
        if (!$options['enabled']) {
            return '';
        }
        
        // Override options with shortcode attributes
        $atts = shortcode_atts(array(
            'position' => $options['position'],
            'color' => $options['brand_color'],
            'title' => $options['title']
        ), $atts, 'ask_eve_assist');
        
        ob_start();
        ?>
        <div id="ask-eve-shortcode-widget" style="position: relative; z-index: 999999;">
            <script>
                if (typeof askEveWidget === 'undefined') {
                    // Load widget if not already loaded
                    const script = document.createElement('script');
                    script.src = '<?php echo ASK_EVE_PLUGIN_URL; ?>assets/ask-eve-widget.min.js';
                    document.head.appendChild(script);
                }
            </script>
        </div>
        <?php
        return ob_get_clean();
    }
    
    /**
     * Admin scripts and styles
     */
    public function admin_scripts($hook) {
        if ($hook !== 'settings_page_ask-eve-assist') {
            return;
        }
        
        // Add color picker
        wp_enqueue_style('wp-color-picker');
        wp_enqueue_script('wp-color-picker');
        
        wp_add_inline_script('wp-color-picker', '
            jQuery(document).ready(function($) {
                $(".color-picker").wpColorPicker();
            });
        ');
    }
}

// Initialize the plugin
new AskEveAssist();

/**
 * Helper functions for theme developers
 */

/**
 * Display the Ask Eve widget programmatically
 */
function ask_eve_display_widget($args = array()) {
    $options = get_option('ask_eve_options');
    
    if (!$options['enabled']) {
        return;
    }
    
    $widget_instance = new AskEveAssist();
    echo $widget_instance->shortcode($args);
}

/**
 * Check if Ask Eve is enabled
 */
function ask_eve_is_enabled() {
    $options = get_option('ask_eve_options');
    return $options['enabled'];
}

/**
 * Get Ask Eve configuration
 */
function ask_eve_get_config() {
    return get_option('ask_eve_options');
}

?>