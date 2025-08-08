#!/usr/bin/env ts-node

/**
 * Ask Eve Assist Widget Brand Compliance Testing
 * Validates adherence to The Eve Appeal visual branding guidelines
 */

import * as fs from 'fs';
import * as path from 'path';

interface BrandComplianceTestResult {
  test: string;
  passed: boolean;
  details: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

interface BrandComplianceReport {
  overallScore: number;
  passedTests: number;
  totalTests: number;
  results: BrandComplianceTestResult[];
  recommendations: string[];
}

class WidgetBrandComplianceTester {
  private widgetPath: string;
  private widgetContent: string;

  constructor() {
    this.widgetPath = path.join(__dirname, '../ask-eve-widget.js');
    this.widgetContent = fs.readFileSync(this.widgetPath, 'utf-8');
  }

  async runAllTests(): Promise<BrandComplianceReport> {
    console.log('🎨 Testing Ask Eve Assist Widget Brand Compliance...');
    console.log('📋 Following The Eve Appeal Visual Branding Guidelines');
    console.log('');

    const results: BrandComplianceTestResult[] = [];

    // Test 1: Color Palette Compliance
    results.push(this.testColorPalette());

    // Test 2: Typography Standards
    results.push(this.testTypography());

    // Test 3: Heart Symbol Implementation
    results.push(this.testHeartSymbol());

    // Test 4: Message Bubble Design
    results.push(this.testMessageBubbleDesign());

    // Test 5: Accessibility Compliance
    results.push(this.testAccessibilityCompliance());

    // Test 6: Mobile Responsive Standards
    results.push(this.testMobileResponsive());

    // Test 7: Visual Element Restrictions
    results.push(this.testVisualRestrictions());

    // Test 8: Crisis Detection UI
    results.push(this.testCrisisDetectionUI());

    // Test 9: Layout Structure
    results.push(this.testLayoutStructure());

    // Test 10: Performance Requirements
    results.push(await this.testPerformanceRequirements());

    const passedTests = results.filter(r => r.passed).length;
    const totalTests = results.length;
    const overallScore = (passedTests / totalTests) * 100;

    const report: BrandComplianceReport = {
      overallScore,
      passedTests,
      totalTests,
      results,
      recommendations: this.generateRecommendations(results)
    };

    this.displayReport(report);
    return report;
  }

  private testColorPalette(): BrandComplianceTestResult {
    const silverColor = '#DBDDED';
    const redColor = '#FF4D4D';
    
    const hasSilver = this.widgetContent.includes(silverColor);
    const hasCorrectRed = this.widgetContent.includes(redColor);
    const hasGradients = this.widgetContent.includes('linear-gradient');
    const hasOldBrandColor = this.widgetContent.includes('#d63384');

    if (hasSilver && hasCorrectRed && !hasGradients && !hasOldBrandColor) {
      return {
        test: 'Color Palette Compliance',
        passed: true,
        details: `✅ Silver (#DBDDED) and Red (#FF4D4D) used correctly, no gradients found`,
        severity: 'critical'
      };
    } else {
      const issues = [];
      if (!hasSilver) issues.push('Missing silver color #DBDDED');
      if (!hasCorrectRed) issues.push('Missing red color #FF4D4D');
      if (hasGradients) issues.push('Found prohibited gradient backgrounds');
      if (hasOldBrandColor) issues.push('Found old brand color #d63384');

      return {
        test: 'Color Palette Compliance',
        passed: false,
        details: `❌ Issues: ${issues.join(', ')}`,
        severity: 'critical'
      };
    }
  }

  private testTypography(): BrandComplianceTestResult {
    const hasArialFont = this.widgetContent.includes("font-family: Arial");
    const hasSystemFonts = this.widgetContent.includes("'Helvetica Neue', Helvetica, sans-serif");
    const hasProhibitedFonts = this.widgetContent.includes('BlinkMacSystemFont') || 
                              this.widgetContent.includes('Segoe UI');

    if (hasArialFont && hasSystemFonts && !hasProhibitedFonts) {
      return {
        test: 'Typography Standards',
        passed: true,
        details: '✅ Arial font family used consistently with system font fallbacks',
        severity: 'high'
      };
    } else {
      const issues = [];
      if (!hasArialFont) issues.push('Arial not specified as primary font');
      if (!hasSystemFonts) issues.push('Missing system font fallbacks');
      if (hasProhibitedFonts) issues.push('Found non-Arial system fonts in primary position');

      return {
        test: 'Typography Standards',
        passed: false,
        details: `❌ Issues: ${issues.join(', ')}`,
        severity: 'high'
      };
    }
  }

  private testHeartSymbol(): BrandComplianceTestResult {
    const hasEmojiHeart = this.widgetContent.includes('🌺') || this.widgetContent.includes('❤️');
    const hasSVGHeart = this.widgetContent.includes('<svg') && 
                       this.widgetContent.includes('viewBox="0 0 30 30"');
    
    if (!hasEmojiHeart && hasSVGHeart) {
      return {
        test: 'Heart Symbol Implementation',
        passed: true,
        details: '✅ SVG heart symbol used instead of emoji, proper Logo Symbol Small implementation',
        severity: 'medium'
      };
    } else {
      const issues = [];
      if (hasEmojiHeart) issues.push('Found emoji hearts instead of SVG');
      if (!hasSVGHeart) issues.push('Missing SVG heart symbol implementation');

      return {
        test: 'Heart Symbol Implementation',
        passed: false,
        details: `❌ Issues: ${issues.join(', ')}`,
        severity: 'medium'
      };
    }
  }

  private testMessageBubbleDesign(): BrandComplianceTestResult {
    const hasRoundedBubbles = this.widgetContent.includes('border-radius: 12px');
    const hasCleanBorders = this.widgetContent.includes('border: 1px solid');
    const hasGradientBubbles = this.widgetContent.includes('linear-gradient') && 
                              this.widgetContent.includes('.ask-eve-message');
    const hasHeartShapes = this.widgetContent.includes('heart-shaped');

    if (hasRoundedBubbles && hasCleanBorders && !hasGradientBubbles && !hasHeartShapes) {
      return {
        test: 'Message Bubble Design',
        passed: true,
        details: '✅ Clean message bubbles with subtle borders, no decorative elements',
        severity: 'medium'
      };
    } else {
      const issues = [];
      if (!hasRoundedBubbles) issues.push('Missing rounded message bubbles');
      if (!hasCleanBorders) issues.push('Missing clean bubble borders');
      if (hasGradientBubbles) issues.push('Found gradient backgrounds in bubbles');
      if (hasHeartShapes) issues.push('Found prohibited heart-shaped bubbles');

      return {
        test: 'Message Bubble Design',
        passed: false,
        details: `❌ Issues: ${issues.join(', ')}`,
        severity: 'medium'
      };
    }
  }

  private testAccessibilityCompliance(): BrandComplianceTestResult {
    const hasMinTouchTargets = this.widgetContent.includes('min-height: 44px');
    const hasFocusIndicators = this.widgetContent.includes('outline: 2px solid');
    const hasAriaLabels = this.widgetContent.includes('aria-label');
    const hasKeyboardNav = this.widgetContent.includes('onkeypress') || 
                          this.widgetContent.includes('handleKeyPress');

    const accessibilityScore = [hasMinTouchTargets, hasFocusIndicators, hasAriaLabels, hasKeyboardNav]
      .filter(Boolean).length;

    if (accessibilityScore >= 3) {
      return {
        test: 'Accessibility Compliance (WCAG AA)',
        passed: true,
        details: `✅ ${accessibilityScore}/4 accessibility features implemented`,
        severity: 'critical'
      };
    } else {
      const missing = [];
      if (!hasMinTouchTargets) missing.push('44px minimum touch targets');
      if (!hasFocusIndicators) missing.push('Focus indicators');
      if (!hasAriaLabels) missing.push('ARIA labels');
      if (!hasKeyboardNav) missing.push('Keyboard navigation');

      return {
        test: 'Accessibility Compliance (WCAG AA)',
        passed: false,
        details: `❌ Missing: ${missing.join(', ')}`,
        severity: 'critical'
      };
    }
  }

  private testMobileResponsive(): BrandComplianceTestResult {
    const hasFullScreenMobile = this.widgetContent.includes('position: fixed') && 
                               this.widgetContent.includes('width: 100%');
    const hasViewportMeta = this.widgetContent.includes('320px') || 
                           this.widgetContent.includes('480px');
    const hasTabletSupport = this.widgetContent.includes('768px');

    if (hasFullScreenMobile && hasViewportMeta && hasTabletSupport) {
      return {
        test: 'Mobile Responsive Behavior',
        passed: true,
        details: '✅ Full-screen overlay on mobile, adaptive tablet sizing',
        severity: 'high'
      };
    } else {
      const issues = [];
      if (!hasFullScreenMobile) issues.push('Missing full-screen mobile overlay');
      if (!hasViewportMeta) issues.push('Missing mobile viewport handling');
      if (!hasTabletSupport) issues.push('Missing tablet responsive behavior');

      return {
        test: 'Mobile Responsive Behavior',
        passed: false,
        details: `❌ Issues: ${issues.join(', ')}`,
        severity: 'high'
      };
    }
  }

  private testVisualRestrictions(): BrandComplianceTestResult {
    const hasProhibitedElements = [
      this.widgetContent.includes('annotation'),
      this.widgetContent.includes('highlighter'),
      this.widgetContent.includes('decorative'),
      this.widgetContent.includes('secondary-color'),
      this.widgetContent.includes('orange') && !this.widgetContent.includes('#FFA500'), // Allow our emergency orange
      this.widgetContent.includes('pink') && !this.widgetContent.includes('#FF4D4D'),
      this.widgetContent.includes('green')
    ].some(Boolean);

    const hasMultipleColors = this.widgetContent.split('#').length - 1 > 8; // Allow reasonable number of colors

    if (!hasProhibitedElements && !hasMultipleColors) {
      return {
        test: 'Visual Elements Restrictions',
        passed: true,
        details: '✅ No prohibited decorative elements or secondary colors found',
        severity: 'medium'
      };
    } else {
      const issues = [];
      if (hasProhibitedElements) issues.push('Found prohibited visual elements');
      if (hasMultipleColors) issues.push('Too many colors in interface');

      return {
        test: 'Visual Elements Restrictions',
        passed: false,
        details: `❌ Issues: ${issues.join(', ')}`,
        severity: 'medium'
      };
    }
  }

  private testCrisisDetectionUI(): BrandComplianceTestResult {
    const hasAmberCrisis = this.widgetContent.includes('#FFA500');
    const hasRedCrisis = this.widgetContent.includes('#dc3545') || 
                        this.widgetContent.includes('background: red');
    const hasEmergencyContactStyling = this.widgetContent.includes('Emergency contacts included');

    if (hasAmberCrisis && !hasRedCrisis && hasEmergencyContactStyling) {
      return {
        test: 'Crisis Detection UI',
        passed: true,
        details: '✅ Amber/orange crisis styling instead of aggressive red',
        severity: 'high'
      };
    } else {
      const issues = [];
      if (!hasAmberCrisis) issues.push('Missing amber/orange crisis styling');
      if (hasRedCrisis) issues.push('Found aggressive red crisis styling');
      if (!hasEmergencyContactStyling) issues.push('Missing emergency contact indicators');

      return {
        test: 'Crisis Detection UI',
        passed: false,
        details: `❌ Issues: ${issues.join(', ')}`,
        severity: 'high'
      };
    }
  }

  private testLayoutStructure(): BrandComplianceTestResult {
    const hasCorrectDimensions = this.widgetContent.includes('width: 400px') && 
                               this.widgetContent.includes('height: 600px');
    const hasCleanHeader = this.widgetContent.includes('#ask-eve-header') && 
                          this.widgetContent.includes('background: white');
    const hasInputArea = this.widgetContent.includes('#ask-eve-input-container') && 
                        this.widgetContent.includes('border-radius: 12px');

    if (hasCorrectDimensions && hasCleanHeader && hasInputArea) {
      return {
        test: 'Layout Structure',
        passed: true,
        details: '✅ Correct dimensions (400x600px), clean header, proper input area',
        severity: 'medium'
      };
    } else {
      const issues = [];
      if (!hasCorrectDimensions) issues.push('Incorrect widget dimensions');
      if (!hasCleanHeader) issues.push('Header not clean/white');
      if (!hasInputArea) issues.push('Input area styling incorrect');

      return {
        test: 'Layout Structure',
        passed: false,
        details: `❌ Issues: ${issues.join(', ')}`,
        severity: 'medium'
      };
    }
  }

  private async testPerformanceRequirements(): Promise<BrandComplianceTestResult> {
    try {
      const stats = fs.statSync(this.widgetPath);
      const fileSizeKB = stats.size / 1024;
      const hasOptimizedAnimations = this.widgetContent.includes('transition: all 0.2s') || 
                                   this.widgetContent.includes('200-300ms');
      const hasEfficientAssets = !this.widgetContent.includes('data:image') || // No inline images
                                this.widgetContent.includes('<svg'); // SVG icons only

      if (fileSizeKB < 50 && hasOptimizedAnimations && hasEfficientAssets) {
        return {
          test: 'Performance Requirements',
          passed: true,
          details: `✅ Widget size: ${fileSizeKB.toFixed(1)}KB (<50KB target), optimized animations`,
          severity: 'high'
        };
      } else {
        const issues = [];
        if (fileSizeKB >= 50) issues.push(`Widget too large: ${fileSizeKB.toFixed(1)}KB`);
        if (!hasOptimizedAnimations) issues.push('Animations not optimized');
        if (!hasEfficientAssets) issues.push('Asset loading not efficient');

        return {
          test: 'Performance Requirements',
          passed: false,
          details: `❌ Issues: ${issues.join(', ')}`,
          severity: 'high'
        };
      }
    } catch (error) {
      return {
        test: 'Performance Requirements',
        passed: false,
        details: `❌ Could not analyze file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'high'
      };
    }
  }

  private generateRecommendations(results: BrandComplianceTestResult[]): string[] {
    const recommendations: string[] = [];
    const failedTests = results.filter(r => !r.passed);

    if (failedTests.length === 0) {
      recommendations.push('✅ Excellent! All brand compliance tests passed');
      recommendations.push('📈 Consider regular brand compliance audits during development');
      recommendations.push('🎨 Monitor for brand guideline updates from The Eve Appeal');
      return recommendations;
    }

    const criticalIssues = failedTests.filter(r => r.severity === 'critical');
    const highIssues = failedTests.filter(r => r.severity === 'high');

    if (criticalIssues.length > 0) {
      recommendations.push('🚨 CRITICAL: Fix color palette and accessibility issues immediately');
      recommendations.push('🎨 Update widget to use official Eve Appeal colors (#DBDDED, #FF4D4D)');
    }

    if (highIssues.length > 0) {
      recommendations.push('⚠️ HIGH: Address mobile responsive and typography issues');
      recommendations.push('📱 Implement full-screen mobile overlay for better UX');
    }

    if (failedTests.some(r => r.test.includes('Heart Symbol'))) {
      recommendations.push('💖 Replace emoji hearts with official SVG heart symbols');
    }

    if (failedTests.some(r => r.test.includes('Crisis'))) {
      recommendations.push('🚨 Update crisis detection UI to use amber/orange instead of red');
    }

    recommendations.push('📋 Review The Eve Appeal Visual Branding Guidelines document');
    recommendations.push('🧪 Run brand compliance tests after each widget update');

    return recommendations;
  }

  private displayReport(report: BrandComplianceReport): void {
    console.log('\n' + '='.repeat(80));
    console.log('🎨 ASK EVE ASSIST WIDGET BRAND COMPLIANCE REPORT');
    console.log('='.repeat(80));

    console.log(`\n📊 Overall Score: ${report.overallScore.toFixed(1)}% (${report.passedTests}/${report.totalTests} tests passed)`);
    
    if (report.overallScore >= 90) {
      console.log('🎉 EXCELLENT: Widget meets Eve Appeal branding standards!');
    } else if (report.overallScore >= 75) {
      console.log('✅ GOOD: Minor branding improvements needed');
    } else if (report.overallScore >= 50) {
      console.log('⚠️ NEEDS IMPROVEMENT: Several branding issues to address');
    } else {
      console.log('❌ CRITICAL: Major branding compliance issues found');
    }

    console.log('\n📋 Test Results:');
    report.results.forEach(result => {
      const icon = result.passed ? '✅' : '❌';
      const severity = result.severity.toUpperCase().padEnd(8);
      console.log(`   ${icon} [${severity}] ${result.test}`);
      console.log(`      ${result.details}`);
    });

    if (report.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      report.recommendations.forEach(rec => console.log(`   • ${rec}`));
    }

    console.log('\n🎨 Brand Guidelines Summary:');
    console.log('   • Colors: Silver (#DBDDED) background + Red (#FF4D4D) accents only');
    console.log('   • Typography: Arial font family with system fallbacks');
    console.log('   • Icons: SVG heart symbols, no emojis');
    console.log('   • Layout: Clean, professional, no decorative elements');
    console.log('   • Mobile: Full-screen overlay, minimum 44px touch targets');
    console.log('   • Crisis: Amber/orange styling, not aggressive red');

    console.log('\n' + '='.repeat(80));
  }
}

// Main execution
async function main() {
  try {
    const tester = new WidgetBrandComplianceTester();
    const report = await tester.runAllTests();
    
    // Exit with appropriate code
    process.exit(report.overallScore >= 75 ? 0 : 1);
  } catch (error) {
    console.error('❌ Brand compliance test execution failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main();
}

export type { BrandComplianceReport, BrandComplianceTestResult };
export { WidgetBrandComplianceTester };