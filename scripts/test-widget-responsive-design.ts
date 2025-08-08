#!/usr/bin/env ts-node

/**
 * Ask Eve Assist Widget Responsive Design Testing
 * Validates mobile, tablet, and desktop responsive behavior
 */

import * as fs from 'fs';
import * as path from 'path';

interface ResponsiveTestResult {
  test: string;
  viewport: 'mobile' | 'tablet' | 'desktop';
  passed: boolean;
  details: string;
  requirements: string[];
}

interface ResponsiveTestReport {
  overallScore: number;
  passedTests: number;
  totalTests: number;
  results: ResponsiveTestResult[];
  breakpointCoverage: {
    mobile: boolean;
    tablet: boolean;
    desktop: boolean;
  };
}

class WidgetResponsiveDesignTester {
  private widgetPath: string;
  private widgetContent: string;

  constructor() {
    this.widgetPath = path.join(__dirname, '../ask-eve-widget.js');
    this.widgetContent = fs.readFileSync(this.widgetPath, 'utf-8');
  }

  async runAllTests(): Promise<ResponsiveTestReport> {
    console.log('📱 Testing Ask Eve Assist Widget Responsive Design...');
    console.log('🎨 Desktop, Tablet, and Mobile Compatibility Validation');
    console.log('');

    const results: ResponsiveTestResult[] = [];

    // Desktop Tests (>768px)
    results.push(this.testDesktopLayout());
    results.push(this.testDesktopInteractions());

    // Tablet Tests (768px and below)
    results.push(this.testTabletAdaptation());
    results.push(this.testTabletTouchTargets());

    // Mobile Tests (480px and below)
    results.push(this.testMobileFullScreen());
    results.push(this.testMobileTouchOptimization());
    results.push(this.testMobileAccessibility());

    // Cross-device Tests
    results.push(this.testBreakpointTransitions());
    results.push(this.testContentReadability());
    results.push(this.testPerformanceAcrossDevices());

    const passedTests = results.filter(r => r.passed).length;
    const totalTests = results.length;
    const overallScore = (passedTests / totalTests) * 100;

    const breakpointCoverage = {
      mobile: results.some(r => r.viewport === 'mobile' && r.passed),
      tablet: results.some(r => r.viewport === 'tablet' && r.passed),
      desktop: results.some(r => r.viewport === 'desktop' && r.passed)
    };

    const report: ResponsiveTestReport = {
      overallScore,
      passedTests,
      totalTests,
      results,
      breakpointCoverage
    };

    this.displayReport(report);
    return report;
  }

  private testDesktopLayout(): ResponsiveTestResult {
    const hasFixedDimensions = this.widgetContent.includes('width: 400px') && 
                              this.widgetContent.includes('height: 600px');
    const hasPositionedChat = this.widgetContent.includes('position: absolute') && 
                             this.widgetContent.includes('bottom: 90px');
    const hasProperLauncher = this.widgetContent.includes('width: 70px') && 
                             this.widgetContent.includes('height: 70px');

    const requirements = [
      'Fixed 400x600px chat window dimensions',
      'Positioned chat window (bottom-right by default)',
      '70px launcher button'
    ];

    if (hasFixedDimensions && hasPositionedChat && hasProperLauncher) {
      return {
        test: 'Desktop Layout Structure',
        viewport: 'desktop',
        passed: true,
        details: '✅ Fixed dimensions, proper positioning, correct launcher size',
        requirements
      };
    } else {
      const issues = [];
      if (!hasFixedDimensions) issues.push('Missing fixed chat dimensions');
      if (!hasPositionedChat) issues.push('Chat positioning incorrect');
      if (!hasProperLauncher) issues.push('Launcher size incorrect');

      return {
        test: 'Desktop Layout Structure',
        viewport: 'desktop',
        passed: false,
        details: `❌ Issues: ${issues.join(', ')}`,
        requirements
      };
    }
  }

  private testDesktopInteractions(): ResponsiveTestResult {
    const hasHoverStates = this.widgetContent.includes(':hover');
    const hasFocusStates = this.widgetContent.includes(':focus');
    const hasKeyboardNav = this.widgetContent.includes('handleKeyPress') || 
                          this.widgetContent.includes('onkeypress');
    const hasClickHandlers = this.widgetContent.includes('onclick') || 
                            this.widgetContent.includes('click');

    const requirements = [
      'Hover states for interactive elements',
      'Focus indicators for keyboard navigation',
      'Keyboard event handling',
      'Click/mouse interaction support'
    ];

    const interactionScore = [hasHoverStates, hasFocusStates, hasKeyboardNav, hasClickHandlers]
      .filter(Boolean).length;

    if (interactionScore >= 3) {
      return {
        test: 'Desktop Interactions',
        viewport: 'desktop',
        passed: true,
        details: `✅ ${interactionScore}/4 desktop interaction features implemented`,
        requirements
      };
    } else {
      const missing = [];
      if (!hasHoverStates) missing.push('Hover states');
      if (!hasFocusStates) missing.push('Focus indicators');
      if (!hasKeyboardNav) missing.push('Keyboard navigation');
      if (!hasClickHandlers) missing.push('Click handlers');

      return {
        test: 'Desktop Interactions',
        viewport: 'desktop',
        passed: false,
        details: `❌ Missing: ${missing.join(', ')}`,
        requirements
      };
    }
  }

  private testTabletAdaptation(): ResponsiveTestResult {
    const hasTabletBreakpoint = this.widgetContent.includes('@media (max-width: 768px)');
    const hasFlexibleWidth = this.widgetContent.includes('width: calc(') || 
                            this.widgetContent.includes('flexible width');
    const hasTabletHeight = this.widgetContent.includes('70vh') || 
                           this.widgetContent.includes('height: 80%');

    const requirements = [
      '768px breakpoint defined',
      'Flexible width calculation',
      'Appropriate height for tablet viewports'
    ];

    if (hasTabletBreakpoint && (hasFlexibleWidth || hasTabletHeight)) {
      return {
        test: 'Tablet Responsive Adaptation',
        viewport: 'tablet',
        passed: true,
        details: '✅ Tablet breakpoint with flexible dimensions',
        requirements
      };
    } else {
      const issues = [];
      if (!hasTabletBreakpoint) issues.push('Missing 768px breakpoint');
      if (!hasFlexibleWidth && !hasTabletHeight) issues.push('Missing flexible dimensions');

      return {
        test: 'Tablet Responsive Adaptation',
        viewport: 'tablet',
        passed: false,
        details: `❌ Issues: ${issues.join(', ')}`,
        requirements
      };
    }
  }

  private testTabletTouchTargets(): ResponsiveTestResult {
    const hasMinTouchSize = this.widgetContent.includes('min-height: 44px') || 
                           this.widgetContent.includes('min-width: 44px');
    const hasLargerButtons = this.widgetContent.includes('width: 70px') && 
                            this.widgetContent.includes('height: 70px'); // Launcher
    const hasProperPadding = this.widgetContent.includes('padding: 12px') || 
                            this.widgetContent.includes('padding: 16px');

    const requirements = [
      'Minimum 44px touch targets',
      'Larger launcher button (70px)',
      'Adequate padding for touch interaction'
    ];

    if (hasMinTouchSize && hasLargerButtons && hasProperPadding) {
      return {
        test: 'Tablet Touch Target Optimization',
        viewport: 'tablet',
        passed: true,
        details: '✅ Touch targets meet 44px minimum with proper spacing',
        requirements
      };
    } else {
      const issues = [];
      if (!hasMinTouchSize) issues.push('Touch targets too small');
      if (!hasLargerButtons) issues.push('Launcher button too small');
      if (!hasProperPadding) issues.push('Insufficient padding');

      return {
        test: 'Tablet Touch Target Optimization',
        viewport: 'tablet',
        passed: false,
        details: `❌ Issues: ${issues.join(', ')}`,
        requirements
      };
    }
  }

  private testMobileFullScreen(): ResponsiveTestResult {
    const hasMobileBreakpoint = this.widgetContent.includes('@media (max-width: 768px)') || 
                               this.widgetContent.includes('@media (max-width: 480px)');
    const hasFullScreenOverlay = this.widgetContent.includes('position: fixed') && 
                                this.widgetContent.includes('top: 0') && 
                                this.widgetContent.includes('left: 0') && 
                                this.widgetContent.includes('right: 0') && 
                                this.widgetContent.includes('bottom: 0');
    const hasFullDimensions = this.widgetContent.includes('width: 100%') && 
                             this.widgetContent.includes('height: 100%');

    const requirements = [
      'Mobile breakpoint (768px or 480px)',
      'Full-screen overlay positioning',
      '100% width and height on mobile'
    ];

    if (hasMobileBreakpoint && hasFullScreenOverlay && hasFullDimensions) {
      return {
        test: 'Mobile Full-Screen Implementation',
        viewport: 'mobile',
        passed: true,
        details: '✅ Full-screen overlay with proper positioning',
        requirements
      };
    } else {
      const issues = [];
      if (!hasMobileBreakpoint) issues.push('Missing mobile breakpoint');
      if (!hasFullScreenOverlay) issues.push('Missing full-screen overlay');
      if (!hasFullDimensions) issues.push('Missing 100% dimensions');

      return {
        test: 'Mobile Full-Screen Implementation',
        viewport: 'mobile',
        passed: false,
        details: `❌ Issues: ${issues.join(', ')}`,
        requirements
      };
    }
  }

  private testMobileTouchOptimization(): ResponsiveTestResult {
    const hasLargeTouchTargets = this.widgetContent.includes('min-height: 44px');
    const hasMobileFontSize = this.widgetContent.includes('font-size: 16px') || 
                             this.widgetContent.includes('font-size: 14px');
    const hasEnhancedPadding = this.widgetContent.includes('padding: 20px') || 
                              this.widgetContent.includes('padding: 16px');
    const hasLargerCloseButton = this.widgetContent.includes('width: 44px') && 
                                this.widgetContent.includes('height: 44px');

    const requirements = [
      'Touch targets minimum 44px',
      'Readable font sizes (14px+)',
      'Enhanced padding for touch',
      'Larger close button (44px)'
    ];

    const mobileScore = [hasLargeTouchTargets, hasMobileFontSize, hasEnhancedPadding, hasLargerCloseButton]
      .filter(Boolean).length;

    if (mobileScore >= 3) {
      return {
        test: 'Mobile Touch Optimization',
        viewport: 'mobile',
        passed: true,
        details: `✅ ${mobileScore}/4 mobile touch features optimized`,
        requirements
      };
    } else {
      const missing = [];
      if (!hasLargeTouchTargets) missing.push('Touch targets too small');
      if (!hasMobileFontSize) missing.push('Font size too small');
      if (!hasEnhancedPadding) missing.push('Insufficient padding');
      if (!hasLargerCloseButton) missing.push('Close button too small');

      return {
        test: 'Mobile Touch Optimization',
        viewport: 'mobile',
        passed: false,
        details: `❌ Missing: ${missing.join(', ')}`,
        requirements
      };
    }
  }

  private testMobileAccessibility(): ResponsiveTestResult {
    const hasViewportMeta = this.widgetContent.includes('viewport') || 
                           this.widgetContent.includes('max-width: 480px');
    const hasAriaLabels = this.widgetContent.includes('aria-label');
    const hasSemanticHTML = this.widgetContent.includes('<button') && 
                           this.widgetContent.includes('role=') || 
                           this.widgetContent.includes('aria-');
    const hasContrastRatio = !this.widgetContent.includes('color: #ccc') && // No low contrast
                            this.widgetContent.includes('color: #0C0B0B'); // High contrast text

    const requirements = [
      'Viewport meta tag consideration',
      'ARIA labels for screen readers',
      'Semantic HTML elements',
      'High contrast ratios (WCAG AA)'
    ];

    const accessibilityScore = [hasViewportMeta, hasAriaLabels, hasSemanticHTML, hasContrastRatio]
      .filter(Boolean).length;

    if (accessibilityScore >= 3) {
      return {
        test: 'Mobile Accessibility',
        viewport: 'mobile',
        passed: true,
        details: `✅ ${accessibilityScore}/4 mobile accessibility features`,
        requirements
      };
    } else {
      const missing = [];
      if (!hasViewportMeta) missing.push('Viewport handling');
      if (!hasAriaLabels) missing.push('ARIA labels');
      if (!hasSemanticHTML) missing.push('Semantic HTML');
      if (!hasContrastRatio) missing.push('Contrast ratios');

      return {
        test: 'Mobile Accessibility',
        viewport: 'mobile',
        passed: false,
        details: `❌ Missing: ${missing.join(', ')}`,
        requirements
      };
    }
  }

  private testBreakpointTransitions(): ResponsiveTestResult {
    const hasSmootTransitions = this.widgetContent.includes('transition:') || 
                               this.widgetContent.includes('animation:');
    const hasMultipleBreakpoints = (this.widgetContent.match(/@media/g) || []).length >= 2;
    const hasOverlapHandling = this.widgetContent.includes('!important') && 
                              this.widgetContent.includes('@media');

    const requirements = [
      'Smooth transitions between breakpoints',
      'Multiple breakpoints defined',
      'CSS specificity handling for overlaps'
    ];

    if (hasSmootTransitions && hasMultipleBreakpoints && hasOverlapHandling) {
      return {
        test: 'Breakpoint Transitions',
        viewport: 'desktop',
        passed: true,
        details: '✅ Smooth transitions with proper breakpoint handling',
        requirements
      };
    } else {
      const issues = [];
      if (!hasSmootTransitions) issues.push('Missing smooth transitions');
      if (!hasMultipleBreakpoints) issues.push('Insufficient breakpoints');
      if (!hasOverlapHandling) issues.push('Missing CSS specificity handling');

      return {
        test: 'Breakpoint Transitions',
        viewport: 'desktop',
        passed: false,
        details: `❌ Issues: ${issues.join(', ')}`,
        requirements
      };
    }
  }

  private testContentReadability(): ResponsiveTestResult {
    const hasReadableFontSize = this.widgetContent.includes('font-size: 14px') || 
                               this.widgetContent.includes('font-size: 16px');
    const hasProperLineHeight = this.widgetContent.includes('line-height: 1.2') || 
                               this.widgetContent.includes('line-height: 1.4');
    const hasContentWrapping = this.widgetContent.includes('word-wrap: break-word') || 
                              this.widgetContent.includes('overflow-wrap: break-word');
    const hasMaxWidth = this.widgetContent.includes('max-width: 70%') || 
                       this.widgetContent.includes('max-width: 85%');

    const requirements = [
      'Readable font sizes (14px+)',
      'Proper line height (1.2-1.4)',
      'Content wrapping for long text',
      'Maximum width limits for readability'
    ];

    const readabilityScore = [hasReadableFontSize, hasProperLineHeight, hasContentWrapping, hasMaxWidth]
      .filter(Boolean).length;

    if (readabilityScore >= 3) {
      return {
        test: 'Content Readability Across Devices',
        viewport: 'mobile',
        passed: true,
        details: `✅ ${readabilityScore}/4 readability features implemented`,
        requirements
      };
    } else {
      const missing = [];
      if (!hasReadableFontSize) missing.push('Font size too small');
      if (!hasProperLineHeight) missing.push('Line height issues');
      if (!hasContentWrapping) missing.push('Text wrapping problems');
      if (!hasMaxWidth) missing.push('Content width issues');

      return {
        test: 'Content Readability Across Devices',
        viewport: 'mobile',
        passed: false,
        details: `❌ Missing: ${missing.join(', ')}`,
        requirements
      };
    }
  }

  private testPerformanceAcrossDevices(): ResponsiveTestResult {
    const hasOptimizedAnimations = this.widgetContent.includes('transition: all 0.2s') || 
                                  this.widgetContent.includes('animation:') && 
                                  this.widgetContent.includes('ease');
    const hasEfficientCSS = !this.widgetContent.includes('* {') && // No universal selectors
                           !this.widgetContent.includes('!important !important'); // No redundancy
    const hasMinimalJavaScript = this.widgetContent.length < 30000; // Under 30KB for good mobile performance

    const requirements = [
      'Optimized animations (200ms or less)',
      'Efficient CSS without universal selectors',
      'Minimal JavaScript bundle size'
    ];

    if (hasOptimizedAnimations && hasEfficientCSS && hasMinimalJavaScript) {
      return {
        test: 'Performance Across Devices',
        viewport: 'mobile',
        passed: true,
        details: `✅ Optimized animations, efficient CSS, compact bundle`,
        requirements
      };
    } else {
      const issues = [];
      if (!hasOptimizedAnimations) issues.push('Animations not optimized');
      if (!hasEfficientCSS) issues.push('Inefficient CSS');
      if (!hasMinimalJavaScript) issues.push('Bundle too large');

      return {
        test: 'Performance Across Devices',
        viewport: 'mobile',
        passed: false,
        details: `❌ Issues: ${issues.join(', ')}`,
        requirements
      };
    }
  }

  private displayReport(report: ResponsiveTestReport): void {
    console.log('\n' + '='.repeat(80));
    console.log('📱 ASK EVE ASSIST WIDGET RESPONSIVE DESIGN REPORT');
    console.log('='.repeat(80));

    console.log(`\n📊 Overall Score: ${report.overallScore.toFixed(1)}% (${report.passedTests}/${report.totalTests} tests passed)`);
    
    console.log('\n🖥️ Device Compatibility:');
    console.log(`   Desktop (>768px):  ${report.breakpointCoverage.desktop ? '✅' : '❌'}`);
    console.log(`   Tablet (≤768px):   ${report.breakpointCoverage.tablet ? '✅' : '❌'}`);
    console.log(`   Mobile (≤480px):   ${report.breakpointCoverage.mobile ? '✅' : '❌'}`);

    if (report.overallScore >= 90) {
      console.log('\n🎉 EXCELLENT: Widget is fully responsive across all devices!');
    } else if (report.overallScore >= 75) {
      console.log('\n✅ GOOD: Minor responsive improvements needed');
    } else if (report.overallScore >= 50) {
      console.log('\n⚠️ NEEDS IMPROVEMENT: Several responsive issues to address');
    } else {
      console.log('\n❌ CRITICAL: Major responsive design issues found');
    }

    console.log('\n📋 Detailed Results:');
    const desktopTests = report.results.filter(r => r.viewport === 'desktop');
    const tabletTests = report.results.filter(r => r.viewport === 'tablet');  
    const mobileTests = report.results.filter(r => r.viewport === 'mobile');

    if (desktopTests.length > 0) {
      console.log('\n   🖥️ Desktop Tests:');
      desktopTests.forEach(result => {
        const icon = result.passed ? '✅' : '❌';
        console.log(`      ${icon} ${result.test}`);
        console.log(`         ${result.details}`);
      });
    }

    if (tabletTests.length > 0) {
      console.log('\n   📱 Tablet Tests:');
      tabletTests.forEach(result => {
        const icon = result.passed ? '✅' : '❌';
        console.log(`      ${icon} ${result.test}`);
        console.log(`         ${result.details}`);
      });
    }

    if (mobileTests.length > 0) {
      console.log('\n   📱 Mobile Tests:');
      mobileTests.forEach(result => {
        const icon = result.passed ? '✅' : '❌';
        console.log(`      ${icon} ${result.test}`);
        console.log(`         ${result.details}`);
      });
    }

    console.log('\n🎯 Responsive Design Requirements:');
    console.log('   • Desktop: Fixed 400x600px with hover/focus states');
    console.log('   • Tablet: Flexible width with 44px touch targets');
    console.log('   • Mobile: Full-screen overlay with enhanced touch optimization');
    console.log('   • All: WCAG AA accessibility, smooth transitions');

    console.log('\n' + '='.repeat(80));
  }
}

// Main execution
async function main() {
  try {
    const tester = new WidgetResponsiveDesignTester();
    const report = await tester.runAllTests();
    
    // Exit with appropriate code
    process.exit(report.overallScore >= 75 ? 0 : 1);
  } catch (error) {
    console.error('❌ Responsive design test execution failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main();
}

export type { ResponsiveTestReport, ResponsiveTestResult };
export { WidgetResponsiveDesignTester };