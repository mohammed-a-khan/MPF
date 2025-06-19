import { CSBasePage } from '../../../src/core/pages/CSBasePage';
import { CSGetElement } from '../../../src/core/elements/decorators/CSGetElement';
import { CSWebElement } from '../../../src/core/elements/CSWebElement';

export class DealSeriesPage extends CSBasePage {
    pageUrl = '';

    @CSGetElement({
        locatorType: 'xpath',
        locatorValue: '//div[@class="abcd-select__wrapper"]//button[@name="searchType"]',
        description: 'Search type dropdown'
    })
    private searchTypeDropdown!: CSWebElement;

    @CSGetElement({
        locatorType: 'xpath',
        locatorValue: '//div[@class="abcd-select__wrapper"]//button[@name="searchType"]/span[@class="abcd-button__label"]',
        description: 'Selected search type text'
    })
    private selectedSearchType!: CSWebElement;

    @CSGetElement({
        locatorType: 'xpath',
        locatorValue: '//div[@class="abcd-select__wrapper"]//button[@name="searchAttributes"]',
        description: 'Search attributes dropdown'
    })
    private searchAttributesDropdown!: CSWebElement;

    @CSGetElement({
        locatorType: 'xpath',
        locatorValue: '//div[@class="abcd-select__wrapper"]//button[@name="searchAttributes"]/span[@class="abcd-button__label"]',
        description: 'Selected search attribute text'
    })
    private selectedSearchAttribute!: CSWebElement;

    @CSGetElement({
        locatorType: 'xpath',
        locatorValue: '//span[text()="Search"]/parent::button[@type="submit"]',
        description: 'Search button'
    })
    private searchButton!: CSWebElement;

    @CSGetElement({
        locatorType: 'xpath',
        locatorValue: '//table',
        description: 'Results table'
    })
    private resultsTable!: CSWebElement;

    private readonly searchTypeOptions = [
        'ESSS', 'Series', 'Reference Interest', 'Fallback Interest',
        'Product Group', 'Business Line', 'Benchmark', 'Administrator', 'CDI Name'
    ];

    private readonly searchAttributeOptions = ['Key', 'Name', 'ID'];

    private getSearchTypeOption(option: string): CSWebElement {
        return new CSWebElement(this.page, {
            locatorType: 'xpath',
            locatorValue: `//div[@class='abcd-select__wrapper']//button[@name='searchType']/parent::div//div[@class='abcd-balloon__content']/span[text()='${option}']/ancestor::li[position()=1]`,
            description: `Search type option: ${option}`
        });
    }

    private getSearchAttributeOption(option: string): CSWebElement {
        return new CSWebElement(this.page, {
            locatorType: 'xpath',
            locatorValue: `//div[@class='abcd-select__wrapper']//button[@name='searchAttributes']/parent::div//div[@class='abcd-balloon__content']/span[text()='${option}']/ancestor::li[position()=1]`,
            description: `Search attribute option: ${option}`
        });
    }

    private getSearchInput(attribute: string): CSWebElement {
        return new CSWebElement(this.page, {
            locatorType: 'xpath',
            locatorValue: `//div[text()='Search By']/parent::form//label[text()='${attribute}']/following::div[position()=1]//input`,
            description: `Search input for attribute: ${attribute}`
        });
    }

    private getTableRow(index: number): CSWebElement {
        return new CSWebElement(this.page, {
            locatorType: 'xpath',
            locatorValue: `//table//tbody/tr[position()=${index}]//td[position()=2]`,
            description: `Table row ${index} type cell`
        });
    }

    private getTableRowValue(index: number): CSWebElement {
        return new CSWebElement(this.page, {
            locatorType: 'xpath',
            locatorValue: `//table//tbody/tr[position()=${index}]//td[position()=2]//span`,
            description: `Table row ${index} value cell`
        });
    }

    private getTableRows(): CSWebElement {
        return new CSWebElement(this.page, {
            locatorType: 'xpath',
            locatorValue: '//table//tbody/tr',
            description: 'All table rows'
        });
    }

    async selectSearchType(option: string) {
        await this.searchTypeDropdown.click();
        const optionElement = this.getSearchTypeOption(option);
        await optionElement.click();
        const selectedLocator = await this.selectedSearchType.getLocator();
        const selectedText = (await selectedLocator.textContent()) || '';
        if (selectedText !== option) {
            throw new Error(`Expected selected type to be ${option} but found ${selectedText}`);
        }
    }

    async selectSearchAttribute(option: string) {
        await this.searchAttributesDropdown.click();
        const optionElement = this.getSearchAttributeOption(option);
        await optionElement.click();
        const selectedLocator = await this.selectedSearchAttribute.getLocator();
        const selectedText = (await selectedLocator.textContent()) || '';
        if (selectedText !== option) {
            throw new Error(`Expected selected attribute to be ${option} but found ${selectedText}`);
        }
    }

    async enterSearchValue(value: string) {
        const selectedLocator = await this.selectedSearchAttribute.getLocator();
        const selectedAttribute = (await selectedLocator.textContent()) || '';
        const searchInput = this.getSearchInput(selectedAttribute);
        await searchInput.fill(value);
    }

    async clickSearch() {
        await this.searchButton.click();
    }

    async verifySearchResults(expectedValue: string) {
        await this.resultsTable.waitFor({ state: 'visible' });
        const rowsElement = this.getTableRows();
        const rowsLocator = await rowsElement.getLocator();
        const rowCount = await rowsLocator.count();
        
        for (let i = 1; i <= rowCount; i++) {
            const typeCell = this.getTableRow(i);
            const typeCellLocator = await typeCell.getLocator();
            const typeCellText = (await typeCellLocator.textContent()) || '';
            
            if (typeCellText === 'ESSS') {
                const valueCell = this.getTableRowValue(i);
                const valueCellLocator = await valueCell.getLocator();
                const valueCellText = (await valueCellLocator.textContent()) || '';
                if (valueCellText === expectedValue) {
                    return;
                }
            }
        }
        throw new Error(`Expected value ${expectedValue} not found in search results`);
    }

    async verifySearchTypeOptions() {
        await this.searchTypeDropdown.click();
        for (const option of this.searchTypeOptions) {
            const optionElement = this.getSearchTypeOption(option);
            await optionElement.waitFor({ state: 'visible' });
        }
    }

    async verifySearchAttributeOptions() {
        await this.searchAttributesDropdown.click();
        for (const option of this.searchAttributeOptions) {
            const optionElement = this.getSearchAttributeOption(option);
            await optionElement.waitFor({ state: 'visible' });
        }
    }

    async waitForPageLoad() {
        await this.page.waitForLoadState('networkidle');
    }
} 