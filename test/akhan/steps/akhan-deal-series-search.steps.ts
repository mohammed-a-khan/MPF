import { CSBDDBaseStepDefinition } from '../../../src/bdd/base/CSBDDBaseStepDefinition';
import { CSBDDStepDef, StepDefinitions, PageObject } from '../../../src/bdd/decorators/CSBDDStepDef';
import { DealSeriesPage } from '../pages/DealSeriesPage';

@StepDefinitions
export class AKHANDealSeriesSearchSteps extends CSBDDBaseStepDefinition {
    @PageObject(DealSeriesPage) dealSeriesPage!: DealSeriesPage;

    @CSBDDStepDef('user verifies all search type options')
    async verifySearchTypeOptions() {
        await this.dealSeriesPage.verifySearchTypeOptions();
    }

    @CSBDDStepDef('user selects "{string}" from search type dropdown')
    async selectSearchType(searchType: string) {
        await this.dealSeriesPage.selectSearchType(searchType);
    }

    @CSBDDStepDef('user verifies all search attribute options')
    async verifySearchAttributeOptions() {
        await this.dealSeriesPage.verifySearchAttributeOptions();
    }

    @CSBDDStepDef('user selects "{string}" from search attribute dropdown')
    async selectSearchAttribute(attribute: string) {
        await this.dealSeriesPage.selectSearchAttribute(attribute);
    }

    @CSBDDStepDef('user enters search value "{string}"')
    async enterSearchValue(value: string) {
        await this.dealSeriesPage.enterSearchValue(value);
    }

    @CSBDDStepDef('user clicks on Search button')
    async clickSearch() {
        await this.dealSeriesPage.clickSearch();
    }

    @CSBDDStepDef('user should see "{string}" in search results')
    async verifySearchResults(expectedValue: string) {
        await this.dealSeriesPage.verifySearchResults(expectedValue);
    }
} 